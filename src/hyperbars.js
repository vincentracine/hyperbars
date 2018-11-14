/**
 * Hyperbars version 0.1.2
 *
 * Copyright (c) 2016 Vincent Racine
 * Updated 2018 Josiah Bryan <josiahbryan@gmail.com>
 * - Support for non-block helpers - ex {{current-time}}
 * - Support for helper names that aren't valid javascript variable names (e.x. "url-for")
 * - Support for helpers without arguments
 * - Support for special-case context values from non-block helpers {h: [...]} and {html:""} - see test cases
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
						content: text.replace(/'/g, "\\'")
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
		 * Register helpers
		 */
		'registerHelper': function(name, handler){
			Hyperbars.Runtime[name] = handler;
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
					parameters = string.split(regex).filter(Boolean),
					headers = parameters[0].split(' ').slice(1),
					partial = partials[headers[0]];

				if(!partial)
					throw new Error('Partial "' + headers[0] + '" is missing. Please add it to Hyperbars.partials.');

				// Partial context setup
				if(headers[1]){
					var context;
					if(headers[1].indexOf('=') > -1){
						context = "context";
						var parameter = headers[1].split('='),
							parsed = block2js(parameter[1]);
						if(parsed.indexOf("''+") == 0) parsed = parsed.slice(3);
						parameters.push(parameter[0] + "=" + parsed);
					}else{
						context = block2js(headers[1]);
						if(context.indexOf("''+") == 0) context = context.slice(3);
					}
				}

				// Partial parameters setup
				parameters = parameters.slice(1).filter(function(s){ return !!s.trim() }).map(function(s){ return s.replace('=',':')});
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

				// Function extraction
				// This rewrite of the previous form of whitespace detection was
				// necessary to handle helpers that don't have any attributes.
				const exprEnd  = expression.indexOf('}}'),
					exprBody   = expression.slice(3, exprEnd),
					match      = /([^\s]+)/.exec(exprBody), // grab function name even if no whitespace, e.g. {{#hello-world}}
					fn         = match[0];

				// Attribute extraction
				let unnamedParameterCount = 0;
				var regex = /([\S]+(?:=["']?[^"\s]*['"]?)?)/g,
					parameters = expression
						.substring(3 + fn.length, expression.length)
						.replace('}}', '')
						.split(regex)
						.filter(function(string){return !!string && string != " "})
						.map(function(string){
							if(string.indexOf("=") > -1){
								var s = string.trim().split("=");
								s[1] = s[1].replace(/\\\'/g,"'"); // de-esape single quotes
								if((s[1][0] != '"' && s[1].slice(-1) != '"') &&
							 	   (s[1][0] != "'" && s[1].slice(-1) != "'")){
									if(isNaN(s[1]+0) && s[1] !== 'true' && s[1] !== 'false') {
										s[1] = block2js(s[1]);
										if(s[1].indexOf("''+") == 0){
											s[1] = s[1].slice(3);
										}
									}
								}
								return `${s[0]}: ${s[1]}`;
							}else{
								string = string.trim();
								string = string.replace(/\\\'/g,"'"); // de-esape single quotes
								if((string[0] != '"' && string.slice(-1) != '"') &&
							 	   (string[0] != "'" && string.slice(-1) != "'")){
									if(isNaN(string+0) && string !== 'true' && string !== 'false') {
										string = block2js(string);
										if(string.indexOf("''+") == 0){
											string = string.slice(3);
										}
									}
								}
								return `${unnamedParameterCount ++}: ${string}`;
							}
						});

				parameters.push(`length: ${unnamedParameterCount}`);

				// Function call syntax changed to handle helper names that aren't
				// valid javascript variable names, e.x. "hello-world"
				return [
					"Runtime['",
					fn.replace(/'/g, '\\\''),
					"'](context, " + "{ " + parameters.join(', ') + " }" + ", function(context, parent, options){return ["
				].join('');
			};

			/**
			 * Converts attribute value to javascript
			 * @param attribute
			 * @returns {string}
			 */
			var attrs2js = function(attribute){
				attribute = attribute.replace(/'/g, "\\'");
				var blocks = attribute.split(/({{[^{}]+)}}/g);
				blocks = blocks.map(function(block){
					return isHandlebarExpression(block) ? expression2js(block) : block.indexOf('{{') > -1 ? block2js(block.slice(2)) : "'"+block+"'"
				}).join('+');
				return blocks.replace(/\[\+/g, "[").replace(/\[''\+/g, "[").replace(/\+['']*\]/g, "]");
			};

			/**
			 * True if the argument contains handlebar expression
			 * @param string
			 * @returns {boolean}
			 */
			var isHandlebarExpression = function(string){
				return string.indexOf('{{#') > -1 || string.indexOf('{{/') > -1;
			};

			/**
			 * Returns true if the expression is a non-block helper
			 * @param string
			 * @returns {boolean}}
			 */
			var isNonBlockHelper = function(string) {
				if(isHandlebarExpression(string))
					return false;

				// Blocks and end-block caught above, now test for custom helper
				const match = /{{([^\s}]+)/.exec(string);
				if(!match)
					return false;

				if(Hyperbars.Runtime[match[1]])
					return true;

				return false;
			}

			/**
			 * True is the argument contains handlebar expression
			 * @param string
			 * @returns {boolean}
			 */
			var isHandlebarBlock = function(string){
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
					].join('').replace(/return \[,/g, "return [").replace(/,\]}\)\]/g, "]})]");
				}

				if(node.attributes){
					node.attributes = [
						'{',
						Object.keys(node.attributes).map(function(name){ return [string2js(name), attrs2js(node.attributes[name])].join(':') }).join(','),
						'}'
					].join('')
				}

				if(node.type == 'text'){
					if(isNonBlockHelper(node.content)) {
						// Non-block helpers look like variables from context, for example:
						// {{hello-world}}
						// We confirm that this is a helper, not a variable, by checking
						// if "hello-world" is registered in Hyperbars.Runtime. If so,
						// we trick expression2js into parsing them as the opening of a block heler.
						// This next statement almost the same thing as rewriting:
						// {{hello-world}}
						// as
						// {{#hello-world}}{{{this}}}{{/hello-world}}
						// Assuming that Hyperbars.registerHelper('hello-world',...) has been called before .compile()
						return [
							expression2js(node.content.replace('{{','{{#')), //
							// Special-case context.h to allow returning partial trees as args to h(),
							// for example: callback({h: [ 'div', {'id': 'myid' }, [] ]}, ...)
							"context.h ? h(...context.h) : ",
							// Special-case context.html to allow returning raw html,
							// for example: callback({html:"<whatever>...</whatever>"}, ...)
							"context.html ? h('div', {'innerHTML':'' + context.html}, []) : ",
							// Generic catch-all to stringify context as return value,
							// for example: callback("hello world", ...)
							"context",
							"]})",
						].join('');
					} else
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
		'if': function(context, expression, callback){
			if(expression[0]){
				return callback(isObject(expression[0]) ? expression[0] : context, context);
			}
			return "";
		},
		'unless': function(context, expression, callback){
			if(!expression[0]){
				return callback(isObject(expression[0]) ? expression[0] : context, context);
			}
			return "";
		},
		'each': function(context, expression, callback){
			return expression[0].map(function (item, index, array) {
				var options = {};
				options['@index'] = index;
				options['@first'] = index == 0;
				options['@last']  = index == array.length - 1;
				return callback(item, context, options)
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
	this.debug = false;
	this.partials = {};
});
