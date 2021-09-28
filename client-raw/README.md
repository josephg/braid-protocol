# Braid protocol raw client

This library is a simple reference implementation of the client side of the [braid protocol](https://github.com/braid-org/braid-spec/).

This code parses and returns updates sent over a braid subscription. Each update in a braid subscription is either:

- A snapshot (a replacement of the entire document contents), or
- A set of patches. Each patch has a patchType specifying the type of the patch, headers and content.

Unlike the high level braid library, this implementation does not try to interpret or apply any received patches. Most applications will probably want to use the higher level client library - which returns a stream of document values.

This library (currently) offers no assistance in making it easy to modify server data.

## Getting started

```
npm install --save @braid-protocol/client-raw
```

Then:

```javascript
const { subscribe } = require('@braid-protocol/client-raw')

;(async () => {
  const { updates } = await subscribe('http://localhost:2001/time')
  for await (const { type, headers, value, patches } of updates) {
    if (type === 'snapshot') {
      console.log('new value:', value)
    } else {
      console.log('got patches:', patches)
    }
  }
})()
```

This code will work from either a web browser or from nodejs.


## API

This module exposes 2 methods: *subscribeRaw* and *subscribe*.

- *subscribeRaw* returns updates using raw Uint8Arrays, and makes no attempt to parse any of the braid-specific headers
- *subscribe* will parse out version, content-type and patch-type headers from updates. It will also attempt to convert the contents of patches and updates into JSON objects or strings, based on the specified content-type of responses.


#### subscribeRaw

> **subscribeRaw(url: string, opts?) => Promise<{streamHeaders, updates}>**

subscribeRaw initiates an HTTP request to the specified URL and attempts to start a subscription.

The options field is optional. If present, it can contain the following fields:

- **reqHeaders**: An object containing additional headers to be sent as part of the HTTP request
- *(More will be added later - we also need additional options for the fetch request, like `allowCredentials`). Please file issues / send PRs if we're missing something important here.*

subscribeRaw returns a promise containing:

- **streamHeaders**: An object containing HTTP-level headers returned by the server. Eg `{content-type: 'application/json'}`.
- **updates**: An async iterator which yields updates as they are sent from the server to the client.

You can consume the iterator using a for-await loop:

```javascript
const { updates } = await subscribeRaw('http://localhost:2001/time')

for await (const { type, headers, value, patches } of updates) {
  console.log('got update of type', type, 'with headers', headers)
}
```

Each entry in the updates iterator contains:

- **type**: Either `'snapshot'` or `'patch'`, specifying if the `value` or `patches` field is included in the response, respectively.
- **headers**: Update level headers (duh)
- **value**: Snapshot updates contain a Uint8Array with the new document contents
- **patches**: A list of patches returned by the server. Each patch contains headers and a body field, with the body again being a Uint8Array.


#### subscribe

> **subscribe(url: string, opts?) => Promise<{streamHeaders, updates}>**

This method is a wrapper around `subscribeRaw`, doing some best-guess parsing of the returned content.

> TODO: Document me!
