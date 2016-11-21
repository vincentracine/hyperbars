# Hyperbars
Compile [Handlebars](http://handlebarsjs.com/) templates to javascript which can be used with [Virtual DOM](https://github.com/Matt-Esch/virtual-dom).
This library offer a comprehensive coverage of the Handlebars API and more features will be added soon.

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
	this.context = state || {};
	return [h('div', {}, [(function () {
		var target = this.parent['profile'];
		this.context = Object.prototype.toString.call(target) === '[object Object]' ? target : this.parent;
		if (typeof this.context === 'object') this.context.parent = this.parent;
		if (!!target) {
			return ['    ', '' + this.context.name]
		}
	}.bind({parent: this.context}))()])][0];
}.bind({}))
```

then you can call the returned function with a state object:
```js
Hyperbars.createElement( compiled({ profile:null }) ) // <div></div>
Hyperbars.createElement( compiled({ profile:{ name:"Foo bar" }}) ) // <div>Foo bar</div>
```

## Installation
Step 1: In your `index.html` file, include the hyperbars.js or hyperbars.min.js file:
```html
<script type="text/javascript" src="path/to/dis/hyperbars.js"></script>
```

## Usage
Step 1: Compilation & Setup
```js
var template = "<div>{{name}}</div>"
var state = { name: "Foo bar" }
var compiled = Hyperbars.compile(template)
```
Step 2: Displaying
```js
var tree = compiled(state)
var element = Hyperbars.createElement(tree)

// Do what you will from here e.g document.append(element)
```
Step 3: Updating
```js
// State changes somehow
state.name = "Baz Bar"

// Generate new tree based on new state
var newTree = compiled(state);

// Find sets required to update real DOM so it is identical to virtual dom
var patches = Hyperbars.diff(tree, newTree);

// Update real DOM
Hyperbars.patch(element, patches);

// Cache new tree
tree = newTree;
```
Note: It is best practice to create a function called "setState(newState)" which performs step 3.

## v0.0.8
* Added support for `{{{no-escape}}}`

## v0.0.7
* Added minified version
* Dependencies are now part of the source
* HTML attribute bug fix

## v0.0.6
* Support for `{{@index}}`, `{{@first}}`, `{{@last}}`
* Support for `../`
* Bug fixes

## Roadmap
* Add support for partials
* Add CommonJS support
* Add support for custom helpers
* Add support for `{{else}}`

## Dependencies
* [htmlparser2](https://github.com/fb55/htmlparser2)
* [virtual-dom](https://github.com/Matt-Esch/virtual-dom)

## See also
* [Virtual DOM Handlebars](https://github.com/jchook/virtual-dom-handlebars)
* [handlebars-react](https://github.com/stevenvachon/handlebars-react)

## License
This software is provided free of charge and without restriction under the [MIT License](LICENSE)