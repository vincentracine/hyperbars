/**
 * Hyperbars version 0.1.4
 *
 * Copyright (c) 2016 Vincent Racine
 * @license MIT
 */
module.exports = Hyperbars = (function(Hyperbars){

	'use strict';

	var h = require('virtual-dom/h'),
		diff = require('virtual-dom/diff'),
		patch = require('virtual-dom/patch'),
		createElement = require('virtual-dom/create-element'),
		htmlparser = require("htmlparser2");

	var isObject = function(a){
		return Object.prototype.toString.call(a) === '[object Object]'
	};

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
				var multiple = text.search(/{({[^{}]+})}/) > -1;
				if(multiple){
					text = text.split(/{({[^{}]+})}/g);
					text = text.map(function(item, index, array){
						if(!item || item == "") return undefined;
						if(item == "{") return "";

						if(item[0] == "{" && item.length > 1 && array[index+1] != "}"){
							item = "{"+item+"}";
						}
						if(item[0] == "{" && item.length > 1 && array[index+1] == "}"){
							item = "{{"+item+"}}";
							text[index+1] = "";
						}

						return item;
					}).filter(function(item){ return item != "{" || item != "}" });
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

		'setup': function(obj){
			obj = obj || {};
			h = obj.h;
			diff = obj.diff;
			patch = obj.patch;
			createElement = obj.createElement;
			htmlparser = obj.htmlparser;
		},

		/**
		 * Compiles HTML to use with virtual-dom
		 *
		 * options params:
		 * | name  | default | description
		 * ---------------------------------
		 * | debug |  false  | outputs the js to console
		 * | raw   |  false  | returns the compiled function as a string
		 *
		 * @param template html
		 * @param options options
		 * @returns * compiled function
		 */
		'compile': function(template, options){
			var partials = this.partials;
			options = options || {};
			options.debug = options.debug || false;
			options.raw = options.raw || false;
			options.cache = options.cache || true;

			// Remove special characters
			template = template.replace(/> </g, '><')
				.replace(/> {{/g, '>{{')
				.replace(/}} </g, '}}<')
				.replace(/\n/g, '')
				.replace(/\t/g, '');

			/**
			 * Injects a pre-compiled partial into the code-generation procedure
			 * @param string handlebar partial expression body
			 * @returns {string}
			 */
			var injectPartial = function(string){
				var regex = /([\S]+="[^"]*")/g,
					parameters = string.split(regex),
					headers = parameters[0].split(' ').slice(1),
					partial = partials[headers[0]];

				if(!partial)
					throw new Error('Partial "' + headers[0] + '" is missing. Please add it to Hyperbars.partials.');

				// Partial context setup
				if(headers[1]){
					var context = block2js(headers[1]);
					if(context.indexOf("''+") == 0) context = context.slice(3);
				}
				// Partial parameters setup
				parameters = parameters.slice(1).filter(function(s){ return !!s.trim() }).map(function(s){ return s.replace('="',':"')});
				return partial.toString() + "(Runtime.merge" + (context ? "(" + context: "(context") + (parameters.length ? ",{"+parameters.join(',')+"}))" : "))");
			};

			/**
			 * Returns a formatted string in javascript format based on handlebar expression
			 * @param string
			 */
			var block2js = function(string){
				if(string == "this") return 'context';
				if(string[0] == '@') return "options['"+string+"']";
				if(string[0] == '>') return injectPartial(string);
				var sanitised = string.replace(/(this).?/, '').replace(/..\//g,'parent.'),
					options = "";

				if(string.indexOf('.') > -1 && string.indexOf('..') == -1){
					var dot = sanitised.indexOf('.');
					options = sanitised.slice(dot);
					sanitised = sanitised.slice(0, dot);
				}

				// Do not encode HTML
				if(sanitised[0] == "{"){
					sanitised = sanitised.slice(1);
					return [
						"h('div',{'innerHTML':",
						"''+" + (sanitised.indexOf('parent') == 0 ? sanitised : "context['"+sanitised+"']" + options),
						"}, [])"
					].join('');
				}
				return "''+" + (sanitised.indexOf('parent') == 0 ? sanitised : "context['"+sanitised+"']" + options);
			};

			/**
			 * Places single quotes around a string.
			 * @param string
			 * @returns {string}
			 */
			var string2js = function(string){
				var open = string.indexOf('{{'),
					close = string.indexOf('}}'),
					value = string.slice(open + 2, close);
				if(open != -1 && close != -1){
					return open > 0 ? "'"+string.slice(0, open)+"'+" + block2js(value) : block2js(value);
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
				if(expression.indexOf('{{/') > -1){
					return ']})';
				}

				// Parse
				expression = expression
					.replace(/(this).?/, '')
					.replace(/..\//g,'parent.');

				var whitespace = expression.indexOf(' '),
					fn = expression.slice(3, whitespace),
					value = expression.slice(whitespace + 1, expression.indexOf('}}'));
				return [
					'Runtime.',
					fn,
					'(',
					(value.indexOf('parent') == 0 ? value : value[0] == "@" ? "options['"+value+"']" : "context['"+value+"']"),
					', context, function(context, parent, options){return ['
				].join('');
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
				if(node.children && node.children.length){
					node.children = [
						'[', node.children.map(toJavaScript).join(','), ']'
					].join('')
				}

				if(node.attributes){
					node.attributes = [
						'{',
						Object.keys(node.attributes).map(function(name){ return [string2js(name), attrs2js(node.attributes[name])].join(':') }).join(','),
						'}'
					].join('')
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

			// Parse handlebar template using htmlparser
			var parsed = parse(template)[0];

			// Convert to hyperscript
			var fn = [
				'(function(state){var Runtime = Hyperbars.Runtime;var context = state;return ',
				toJavaScript(parsed),
				'}.bind({}))'
			].join('');

			// Remove those pesky line-breaks!
			fn = fn.replace(/(\r\n|\n|\r)/gm,"");

			if(options.debug || this.debug){
				console.log(fn);
			}

			// function is currently a string so eval it and return it
			return options.raw ? fn : eval(fn);
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

	Hyperbars.Runtime = {
		'if': function(context, parent, callback){
			if(!!context) return callback(isObject(context)?context:parent, parent)
		},
		'unless': function(context, parent, callback){
			if(!context) return callback(isObject(context)?context:parent, parent)
		},
		'each': function(context, parent, callback){
			return context.map(function (item, index, array) {
				var options = {};
				options['@index'] = index;
				options['@first'] = index == 0;
				options['@last'] = index == array.length - 1;
				return callback(item, parent, options)
			})
		},
		/**
		 * credit: http://stackoverflow.com/a/8625261/5678694
		 */
		'merge': function(){
			var obj = {},
				i = 0,
				il = arguments.length,
				key;
			for (; i < il; i++) {
				for (key in arguments[i]) {
					if (arguments[i].hasOwnProperty(key)) {
						obj[key] = arguments[i][key];
					}
				}
			}
			return obj;
		}
	};

	return new Hyperbars();

})(function(){
	this.partialDirectory = '/partials';
	this.debug = false;
	this.partials = {};
});