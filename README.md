# Hyperbars
Compile [Handlebars](http://handlebarsjs.com/) templates to javascript which can be used with [Virtual DOM](https://github.com/Matt-Esch/virtual-dom).

Compiles something like this:
```html
<div>
    {{#if profile}}
        {{name}}
    {{/if}}
</div>
```

into this:
```js
(function (state) {
	var context = state || {};
	return [h('div', {}, [(function (parent) {
		var target = parent['profile'];
		var context = Object.prototype.toString.call(target) === '[object Object]' ? target : parent;
		if (!!target) {
			return [null, '    ', '' + context.name, null]
		}
	})(context)])][0];
})
```
then you can call the returned function with a state object (`createElement` is a [virtual-dom](https://github.com/Matt-Esch/virtual-dom/tree/master/vdom) function):
```js
createElement( compiled({ profile:null }) ) // <div></div>
createElement( compiled({ profile:{ name:"Foo bar" }}) ) // <div>Foo bar</div>
```

## Installation
Step 1: Install [htmlparser2](https://github.com/fb55/htmlparser2) and make sure it's available on the global scope.
```js
if(typeof window.htmlparser !== 'object'){
	throw new Error("Please install htmlparser2")
}
```
Step 2: Install [virtual-dom](https://github.com/Matt-Esch/virtual-dom).


Step 3: In your `index.html` file, include the Hyperbars.js file:
```html
<script type="text/javascript" src="path/to/Hyperbars.js"></script>
```

## Usage
Step 1:
```js
var template = "<div>{{name}}</div>"
var state = { name: "Foo bar" }
var compiled = Hyperbars.compile(template)
```
Step 2:
```js
var element = createElement( compiled(state) )

// Do what you will from here e.g document.append(element)
```

## Roadmap
* Add support for partials
* Add CommonJS support
* Add support for custom helpers
* Add support for `{{else}}`
* Add support for `../`
* Add support for `{{{no-escape}}}`

## Dependencies
* [htmlparser2](https://github.com/fb55/htmlparser2)

## See also
* [Virtual DOM Handlebars](https://github.com/jchook/virtual-dom-handlebars)
* [handlebars-react](https://github.com/stevenvachon/handlebars-react)