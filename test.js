/**
 * Hyperbars tests
 *
 * Copyright (c) 2016 Vincent Racine
 * @license MIT
 */

var Hyperbars = require('./src/hyperbars'),
	h = require('virtual-dom/h'),
	diff = require('virtual-dom/diff'),
	patch = require('virtual-dom/patch'),
	createElement = require('virtual-dom/create-element'),
	htmlparser = require("htmlparser2"),
	colors = require('colors'),
	passed = 0,
	failed = 0;

Hyperbars.setup({
	h: h,
	patch: patch,
	createElement: createElement,
	htmlparser: htmlparser
});

// Helper functions
function test (name, condition) {
	var result = typeof condition === 'function' ? condition() : condition;
	console.log((result ? (passed++, 'pass').green : (failed++, 'fail')).red + "|" + name);
}
function htmlOf(compiled, state){
	state = state || {};
	return createElement(compiled(state)).toString()
}

// Tests
test('CommonJS support', !!Hyperbars && typeof Hyperbars.compile === 'function');
test('Compile html only', function(){
	var html = "<div>Hello world</div>";
	var expect = "<div>Hello world</div>";
	var compiled = Hyperbars.compile(html);
	console.log(Hyperbars.compile(html, {raw:true}));
	return htmlOf(compiled) == expect;
});
test('Compile html only with attributes', function(){
	var html = '<div class="example">Hello world</div>';
	var expect = '<div class="example">Hello world</div>';
	var compiled = Hyperbars.compile(html);
	return htmlOf(compiled) == expect;
});
test('Compile handlebar template', function(){
	var html = '<div>{{name}}</div>';
	var expect = '<div>Foo Bar</div>';
	var state = {name: "Foo Bar"};
	var compiled = Hyperbars.compile(html);
	return htmlOf(compiled, state) == expect;
});
test('Access properties of arrays', function(){
	var html = '<div>{{names.length}}</div>';
	var expect = '<div>2</div>';
	var state = {names: ["Foo Bar", "Biz Boo"]};
	var compiled = Hyperbars.compile(html);
	return htmlOf(compiled, state) == expect;
});
test('#if is true', function(){
	var html = '<div>{{#if bool}}Hello!{{/if}}</div>';
	var expect = '<div>Hello!</div>';
	var state = {bool: true};
	var compiled = Hyperbars.compile(html);
	return htmlOf(compiled, state) == expect;
});
test('#if is false', function(){
	var html = '<div>{{#if bool}}Hello!{{/if}}</div>';
	var expect = '<div></div>';
	var state = {bool: false};
	var compiled = Hyperbars.compile(html);
	return htmlOf(compiled, state) == expect;
});
test('nested handlebar expression', function(){
	var html = '<div>{{#if bool}}{{#if bool}}Hello!{{/if}}{{/if}}</div>';
	var expect = '<div>Hello!</div>';
	var state = {bool: true};
	var compiled = Hyperbars.compile(html);
	return htmlOf(compiled, state) == expect;
});
test('#unless is true', function(){
	var html = '<div>{{#unless bool}}Hello!{{/unless}}</div>';
	var expect = '<div></div>';
	var state = {bool: true};
	var compiled = Hyperbars.compile(html);
	return htmlOf(compiled, state) == expect;
});
test('#unless is false', function(){
	var html = '<div>{{#unless bool}}Hello!{{/unless}}</div>';
	var expect = '<div>Hello!</div>';
	var state = {bool: false};
	var compiled = Hyperbars.compile(html);
	return htmlOf(compiled, state) == expect;
});
test('#each and context', function(){
	var html = '<div>{{#each profiles}}<p>{{name}}</p>{{/each}}</div>';
	var expect = '<div><p>AAA</p><p>BBB</p><p>CCC</p></div>';
	var state = {profiles: [{name:"AAA"},{name:"BBB"},{name:"CCC"}]};
	var compiled = Hyperbars.compile(html);
	return htmlOf(compiled, state) == expect;
});
test('@index', function(){
	var html = '<div>{{#each array}}<p>{{@index}}</p>{{/each}}</div>';
	var expect = '<div><p>0</p><p>1</p><p>2</p></div>';
	var state = {array: ['','','']};
	var compiled = Hyperbars.compile(html);
	return htmlOf(compiled, state) == expect;
});
test('@first', function(){
	var html = '<div>{{#each array}}<p>{{#if @first}}First{{/if}}</p>{{/each}}</div>';
	var expect = '<div><p>First</p><p></p><p></p></div>';
	var state = {array: ['','','']};
	var compiled = Hyperbars.compile(html);
	return htmlOf(compiled, state) == expect;
});
test('@last', function(){
	var html = '<div>{{#each array}}<p>{{#if @last}}Last{{/if}}</p>{{/each}}</div>';
	var expect = '<div><p></p><p></p><p>Last</p></div>';
	var state = {array: ['','','']};
	var compiled = Hyperbars.compile(html);
	return htmlOf(compiled, state) == expect;
});
test('#if context change', function(){
	var html = '<div>{{#if profile}}{{name}}{{/if}}</div>';
	var expect = '<div>Foo Bar</div>';
	var state = {profile: {name: "Foo Bar"}};
	var compiled = Hyperbars.compile(html);
	return htmlOf(compiled, state) == expect;
});
test('../ context change', function(){
	var html = '<div>{{#if obj1}}{{../name}}{{/if}}</div>';
	var expect = '<div>Foo Bar</div>';
	var state = {name: "Foo Bar", obj1: {}};
	var compiled = Hyperbars.compile(html);
	return htmlOf(compiled, state) == expect;
});
test('{{else}}', function(){
	var html = '<div>{{#if profile}}{{else}}No profile{{/if}}</div>';
	var expect = '<div>No profile</div>';
	var state = {profile: null};
	var compiled = Hyperbars.compile(html);
	return htmlOf(compiled, state) == expect;
});
test('basic partials without context', function(){
	Hyperbars.partials['nav'] = Hyperbars.compile('<nav>Navbar</nav>', {raw:true});
	var html = '<header>{{> nav}}</header>';
	var expect = '<header><nav>Navbar</nav></header>';
	var compiled = Hyperbars.compile(html);
	return htmlOf(compiled) == expect;
});
test('basic partials with default context', function(){
	Hyperbars.partials['nav'] = Hyperbars.compile('<nav>{{title}}</nav>', {raw:true});
	var html = '<header>{{> nav}}</header>';
	var expect = '<header><nav>Navbar</nav></header>';
	var state = {title:'Navbar'};
	var compiled = Hyperbars.compile(html);
	return htmlOf(compiled, state) == expect;
});
test('basic partials with custom context', function(){
	Hyperbars.partials['nav'] = Hyperbars.compile('<nav>{{name}}</nav>', {raw:true});
	var html = '<header>{{> nav profile}}</header>';
	var expect = '<header><nav>Foo Bar</nav></header>';
	var state = {profile:{ name: "Foo Bar" }};
	var compiled = Hyperbars.compile(html);
	return htmlOf(compiled, state) == expect;
});
test('basic partials with parameters', function(){
	Hyperbars.partials['nav'] = Hyperbars.compile('<nav>My name is {{name}} and im {{age}} years old.</nav>', {raw:true});
	var html = '<header>{{> nav name="Foo Bar" age="99"}}</header>';
	var expect = '<header><nav>My name is Foo Bar and im 99 years old.</nav></header>';
	var compiled = Hyperbars.compile(html);
	return htmlOf(compiled) == expect;
});

console.log("Passed: " + ("" + passed).green, "| Failed: " + ("" + failed)[failed > 0 ? "red" : "green"]);