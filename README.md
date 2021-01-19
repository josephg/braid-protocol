# What is this?

This is a bare bones implementation of the braid protocol.

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

