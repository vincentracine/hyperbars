/**
 * Hyperbars version 0.0.1
 *
 * Copyright (c) 2016 Vincent Racine
 *
 * @license MIT
 */

(function(Hyperbars){

	'use strict';

	var extend = function(target, more) {
		if (target && more) for (var i in more) if (more.hasOwnProperty(i)) target[i] = more[i];
		return target;
	};

	function VNode(tagName, attributes, children){
		this.simple = true;
		this.tagName = tagName;
		this.attributes = attributes;
		this.children = new VTree(children);
	}
	function VText(text, config) {
		this.virtual = true;
		extend(this, config);

		// Non-overridable
		this.text = [].concat(text);
		this.textOnly = true;
		this.simple = true;
	}
	function VTree(body, config) {
		var i;
		config = extend({ allowJSON: false }, config);
		Object.defineProperty(this, 'config', { enumerable: false, value: config });
		if (body && body.length) {
			for (i=0; i<body.length; i++) {
				this.push(body[i]);
			}
		}
	}
	VTree.prototype = new Array();

	var createVNode = function(spec){
		return new VNode(spec.name, spec.attributes, [])
	};
	var createVText = function(spec){
		return new VText(spec.content)
	};
	var parse = function(html){
		var tree = [],
			current = null;

		var parser = new htmlparser.Parser({
			onopentag: function(name, attrs){
				var node = {
					type: 'tag',
					parent: current,
					name: name,
					attributes: attrs,
					children: []
				};

				node.vnode = createVNode(node);

				if(current){
					current.vnode.children.push(node.vnode);
					current.children.push(node);
				}else{
					tree.push(node);
				}
				current = node;
			},
			ontext: function(text){
				text = text.replace("}{", '}  {').replace("} {", '}   {').replace("}  {", '}    {');
				var multiple = text.search(/{({[^{}]+})}/) > -1;
				if(multiple){
					text = text.split(/{({[^{}]+})}/g);
					text = text.map(function(item, index){
						if(item[0] == "{")
							item = "{"+item+"}";
						return item;
					});
				}else{
					text = [text];
				}

				text.forEach(function(text){
					var node = {
						type: 'text',
						content: text
					};
					node.vtext = createVText(node);
					current.vnode.children.push(node.vtext);
					current.children.push(node);
				});
			},
			onclosetag: function(tagname){
				current = current.parent;
			}
		}, {decodeEntities: true});
		parser.write(html);
		parser.end();

		return tree;
	};

	Hyperbars.prototype = {
		/**
		 * Compiles HTML to use with virtual-dom
		 * @param template html
		 * @param options options
		 * @returns * compiled function
		 */
		'compile': function(template, options){
			options = options || {};

			// Remove spaces
			template = template.replace(/> </g, '><')
				.replace(/> {{/g, '>{{')
				.replace(/}} </g, '}}<')
				.replace(/\n/g, '')
				.replace(/\t/g, '');

			var string2js = function(string){
				var open = string.indexOf('{{'),
					close = string.indexOf('}}'),
					value = string.slice(open + 2, close);

				if(open != -1 && close != -1){
					return "''+context"+(value.indexOf('this') == 0 ? value.slice(4) : '.'+value);
				}else{
					return "'"+string+"'"
				}
			};
			var node2js = function(vnode){
				if(!vnode.children || !vnode.children.length){
					vnode.children = '[]';
				}
				return 'h(' + [string2js(vnode.name), vnode.attributes, vnode.children].join(',') + ')';
			};
			var text2js = function(vtext){
				var content = vtext.content;
				var _if = content.indexOf('{{#if'),
					_unless = content.indexOf('{{#unless'),
					_ifClose = content.indexOf('{{/if'),
					_unlessClose = content.indexOf('{{/unless');

				if(_if > -1){
					return "!!state['" + content.slice(_if+6, content.indexOf('}}')).trim() + "']?";
				}

				if(_unless > -1){
					return "!!!state['" + content.slice(_if+10, content.indexOf('}}')).trim() + "']?";
				}

				if(_ifClose != -1 || _unlessClose != -1)
					return ':null,';

				return string2js(vtext.content);
			};
			var expression2js = function(expression){
				if(expression.indexOf('{{/if') > -1 || expression.indexOf('{{/unless') > -1)
					return ']}})(context)';
				if(expression.indexOf('{{/each') > -1)
					return "]})})(context)";

				var $ops = {
					'if': function(a, options){
						return "(function(parent){var target=parent['" + a + "']"+ (options||"") +";var context=Object.prototype.toString.call(target)==='[object Object]'?target:parent;if(!!target){return [";
					},
					'unless': function(a, options){
						return "(function(parent){var target=parent['" + a + "']"+ (options||"") +";var context=Object.prototype.toString.call(target)==='[object Object]'?target:parent;if(!target){return [";
					},
					'each': function(a, options){
						return "(function(parent){var context=parent; return context['" + a + "']"+ (options||"") +".map(function(context){context.parent = parent;return [";
					}
				};
				var whitespace = expression.indexOf(' '),
					operation = expression.slice(3, whitespace),
					value = expression.slice(whitespace + 1, expression.indexOf('}}')),
					dot = value.indexOf('.'),
					options = value.slice(dot);

				return $ops[operation](dot != -1?value.slice(0, dot):value, dot != -1?options:null);
			};
			var attrs2js = function(attribute){
				var open = attribute.indexOf('{{');
				var close = attribute.indexOf('}}');
				if(open != -1 && close != -1){
					return "context['" + attribute.slice(open + 2, close) + "']";
				}else{
					return  "'" + attribute + "'";
				}
			};

			var isHandlebarExpression = function(string){
				return string.indexOf('{{#') > -1 || string.indexOf('{{/') > -1
			};
			var toJavaScript = function(node){
				var children = node.children,
					attributes = node.attributes;

				if(children && children.length){
					var childs = [],
						opens = 0;

					children.forEach(function(child, index){
						child = toJavaScript(child);
						var len = childs.length;

						if(child.indexOf('(function(){') > -1){
							opens++;
							return childs.push(child);
						}

						if(opens > 0 && (child.indexOf(']}})(context)') > -1||child.indexOf(']})})(context)'))){
							opens--;
							childs[len-1] = childs[len-1] + child;
							return;
						}

						if(opens > 0){
							childs[len-1] = childs[len-1] + child;
							return;
						}else{
							return childs.push(child);
						}
					});

					node.children = '['+childs+']';
				}

				// Handle attributes
				if(attributes){
					node.attributes = ['{', Object.keys(attributes).map(function(name){
						return [string2js(name), attrs2js(attributes[name])].join(':')
					}).join(','), '}'].join('');
				}

				if(node.type == 'text'){
					if(isHandlebarExpression(node.content)){
						return expression2js(node.content);
					}else{
						return text2js(node);
					}
				}

				if(node.type == 'tag'){
					return node2js(node);
				}
			};

			var parsed = parse(template);
			var js = parsed.map(toJavaScript)[0];
			js = ['(function(state){ var context = state || {}; return [', js, '][0]; })'].join('');

			if(options.debug){
				console.log(js);
			}

			return eval(js);
		}
	};

	// Set Hyperbars on 'window'
	window.Hyperbars = new Hyperbars();

})(window.Hyperbars || function(){});