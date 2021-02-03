# Example 3

This example shows how you could use the braid protocol to do realtime
collaborative editing using operational transform.

Compared to example 2, this adds some new Stuff:

- Versions. Each operation is versioned on the server
- IDs. Each operation is assigned an ID in the client. These are used for 2
  reasons:
  - The server uses the ID for deduplication (in case messages get resent with
    bad internet)
  - The client uses the ID to detect (and discard) its own operations in the
    operation stream
- OT. This example does full Operational Transformation in the server and
  client.

This example is currently a sketch - most of the logic here is hairy and
extremely difficult to implement correctly. Application authors probably
shouldn't be doing it! This code should / will be tucked into another library.

## How to run this example

Either compile and then run:

```
npx tsc # (Or npx tsc -w)
node dist/server.js

# and in another terminal
node dist/client.js
```

Or use ts-node:

```
npx ts-node dist/server.js

# and in another terminal
npx ts-node dist/client.js
```

Each time you run the client it'll insert a new 'post' in the 'database'.
