# What is this?

This is a simple implementation of the braid protocol.

It implements simple server and client implementations of the protocol, for use in nodejs and the browser.

# Getting started

https://www.npmjs.com/package/@braid-protocol/server

https://www.npmjs.com/package/@braid-protocol/client

https://www.npmjs.com/package/@braid-protocol/cli

https://www.npmjs.com/package/@braid-protocol/client-raw

## From source

This repository uses a tiny monorepo style. After git cloning, run `yarn` from the root directory of this repository to set everything up.

# Code Examples

I want to explore a few use cases. From simplest to most complicated:

1. Simple series of values which changes over time. (Eg CPU temperature, clock, price of bitcoin)
  - Each update just sends the new value
  - No version information
  - Either read-only or updates just set a new value
2. Document which sends changes using patches
  - When a client connects the first value will contain a document snapshot
  - Subsequent messages contain patches using some `patch-type`
  - The client has to opt in to the patch type (using the `accept-patch` header)
3. Versioned document
  - As above, but the document has a persistent version identifier
  - Each update from the server (the first, and subsequent updates) tell the client the new version identifier
  - The client can specify a known version when it connects:
    - If the known version is the latest version, the server does not need to send data in its initial response
    - If the known version is old the server decides whether to send the missing intervening patches or just send the client a fresh snapshot

For each case I want:

- A server (express)
- Some simple client code

I also want a simple web UI which can connect to any supported URL and show the value updating over time.


# License

> ISC license

Copyright © 2020-2021

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED “AS IS” AND ISC DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL ISC BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
