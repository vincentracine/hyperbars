/**
 * Hyperbars version 0.0.7
 *
 * Copyright (c) 2016 Vincent Racine
 * @license MIT
 */
(function(Hyperbars){

	'use strict';

	var h = require('virtual-dom/h'),
		diff = require('virtual-dom/diff'),
		patch = require('virtual-dom/patch'),
		createElement = require('virtual-dom/create-element'),
		htmlparser = require("htmlparser2");

	/**
	 * Parse handlebar template
	 * @param html
	 * @returns {Array}
	 */
	var parse = function(html){
		var tree = [],
			current = null;

		// Create parser
		var parser = new htmlparser.Parser({
			onopentag: function(name, attrs){
				var node = {
					type: 'tag',
					parent: current,
					name: name,
					attributes: attrs,
					children: []
				};

				if(current){
					current.children.push(node);
				}else{
					tree.push(node);
				}
				current = node;
			},
			ontext: function(text){
				// Deal with adjacent blocks and expressions
				text = text.replace("}{", '}  {').replace("} {", '}   {').replace("}  {", '}    {');
				var multiple = text.search(/{({[^{}]+})}/) > -1;
				if(multiple){
					text = text.split(/{({[^{}]+})}/g);
					text = text.map(function(item, index){
						if(item[0] == "{")
							item = "{"+item+"}";
						if(item == "")
							return undefined;
						return item;
					});
				}else{
					text = [text];
				}

				text = text.filter(Boolean);

				text.forEach(function(text){
					var node = {
						type: 'text',
						content: text
					};
					if(current){
						current.children.push(node);
					}else{
						tree.push(node);
					}
				});
			},
			onclosetag: function(tagname){
				current = current ? current.parent : null;
			}
		}, {decodeEntities: true});

		// Initiate parsing
		parser.write(html);

		// Stop parser
		parser.end();

		// Return parsed html tree
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

			// Remove special characters
			template = template.replace(/> </g, '><')
				.replace(/> {{/g, '>{{')
				.replace(/}} </g, '}}<')
				.replace(/\n/g, '')
				.replace(/\t/g, '');

			/**
			 * Returns a formatted string in javascript format based on handlebar expression
			 * @param string
			 */
			var block2js = function(string){
				string = string.replace(/(this).?/, '').replace(/..\//g,'parent.');
				return string.indexOf('@') == -1 ? string.indexOf('parent') == 0 ? "this."+string : "''+this.context."+string : "this.context['"+string+"']";
			};

			/**
			 * Places single quotes around a string
			 * @param string
			 * @returns {string}
			 */
			var string2js = function(string){
				var open = string.indexOf('{{'),
					close = string.indexOf('}}'),
					value = string.slice(open + 2, close);

				if(open != -1 && close != -1){
					return block2js(value);
				}else{
					return "'"+string+"'"
				}
			};

			/**
			 * Convert vnode to javascript
			 * @param vnode
			 * @returns {string}
			 */
			var node2js = function(vnode){
				if(!vnode.children || !vnode.children.length){
					vnode.children = '[]';
				}
				return 'h(' + [string2js(vnode.name), vnode.attributes, vnode.children].join(',') + ')';
			};

			/**
			 * Converts vtext node to javascript
			 * @param vtext
			 * @returns {*}
			 */
			var text2js = function(vtext){
				return string2js(vtext.content);
			};

			/**
			 * Converts handlebar expression to javascript
			 * @param expression
			 * @returns {*}
			 */
			var expression2js = function(expression){
				// Close if and unless blocks
				if(expression.indexOf('{{/if') > -1 || expression.indexOf('{{/unless') > -1)
					return ']}}.bind({parent:this.context}))()';

				// Close #each block
				if(expression.indexOf('{{/each') > -1)
					return "]}.bind({parent:this.context}))}.bind({parent:this.context}))()";

				// Open function
				var $ops = {
					'if': function(a, options){
						return "(function(){var target=this.parent['" + a + "']"+(options||"")+";this.context=Object.prototype.toString.call(target)==='[object Object]'?target:this.parent;if(typeof this.context==='object')this.context.parent=this.parent;if(!!target){return [";
					},
					'unless': function(a, options){
						return "(function(){var target=this.parent['" + a + "']"+(options||"")+";this.context=Object.prototype.toString.call(target)==='[object Object]'?target:this.parent;if(typeof this.context==='object')this.context.parent=this.parent;if(!target){return [";
					},
					'each': function(a, options){
						return "(function(){this.context=this.parent;return this.context['" + a + "']"+ (options||"") +".map(function(context, index, array){this.context=context;this.context.parent=this.parent;this.context['@index']=index;this.context['@first']=index==0;this.context['@last']=index==array.length-1;return [";
					}
				};
				expression = expression.replace(/(this).?/, '').replace(/..\//g,'parent.');
				var whitespace = expression.indexOf(' '),
					operation = expression.slice(3, whitespace),
					value = expression.slice(whitespace + 1, expression.indexOf('}}')),
					dot = value.indexOf('.'),
					options = value.slice(dot);

				return $ops[operation](dot != -1?value.slice(0, dot):value, dot != -1?options:null);
			};

			/**
			 * Converts attribute value to javascript
			 * @param attribute
			 * @returns {string}
			 */
			var attrs2js = function(attribute){
				if(isHandlebarBlock(attribute)){
					return string2js(attribute);
				}else{
					return  "'" + attribute + "'";
				}
			};

			/**
			 * True is the argument contains handlebar expression
			 * @param string
			 * @returns {boolean}
			 */
			var isHandlebarExpression = function(string){
				return string.indexOf('{{#') > -1 || string.indexOf('{{/') > -1
			};

			/**
			 * True is the argument contains handlebar expression
			 * @param string
			 * @returns {boolean}
			 */
			var isHandlebarBlock= function(string){
				return string.indexOf('{{') > -1 && string.indexOf('}}') > -1
			};

			/**
			 * Converts vnode to javascript
			 * @param node
			 */
			var toJavaScript = function(node){
				var children = node.children,
					attributes = node.attributes;

				// recursively convert children to javascript
				if(children && children.length){
					var _children = [];
					children.forEach(function(child){
						child = toJavaScript(child);
						_children.push(child);
					});
					node.children = '['+_children.join()+']';
				}

				// Handle attributes
				if(attributes){
					node.attributes = ['{', Object.keys(attributes).map(function(name){
						return [string2js(name), attrs2js(attributes[name])].join(':')
					}).join(','), '}'].join('');
				}

				if(node.type == 'text'){
					// Deal with handlebar expressions in text
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

			// Parse handlebar template using htmlparser2
			var parsed = parse(template);

			// Convert parsed html tree to javascript
			var js = parsed.map(toJavaScript)[0];

			// Base function - extend with all children
			js = ['(function(state){this.context=state||{};return [', js, '][0];}.bind({}))'].join('');

			// Helps debug issue's - include the output of this in github issues to help me out ;-)
			if(options.debug){
				console.log(js);
			}

			// function is currently a string so eval it and return it
			return eval(js);
		},

		/**
		 * Dependencies
		 */
		'createElement': createElement,
		'h': h,
		'diff': diff,
		'patch': patch,
		'htmlparser': htmlparser
	};

	// Set Hyperbars on 'window'
	window.Hyperbars = new Hyperbars();

})(window.Hyperbars || function(){});