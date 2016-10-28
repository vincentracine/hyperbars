# Hyperbars
Compiles handlebar template to hyperscript so it can be used with virtual-dom

```
// Compile handlebar template
var render = Hyperbars.compile("<div>{{#if profile}}{{username}}{{/if}}</div>")

// output:
function (state){ var context = state || {}; return [h('div',{},['',(function(parent){var target=parent['profile'];var context=Object.prototype.toString.call(target)==='[object Object]'?target:parent;if(!!target){return [,'    ',''+context.username,'',]}})(context),''])][0]; }

// Create element (virtual-dom function)
createElement(render({ profile:{ username:'Example' }}) // output: <div>Example</div>

// Create element (virtual-dom function)
createElement(render({ profile:null }) // output: <div></div>
```