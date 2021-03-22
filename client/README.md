This is the high level client API for braid.

This is the API most people will probably want to use. Rather than
exposing raw braid subscription messages (patches and snapshots), this
API simply exposes an object which changes over time.

This library has built-in support for the braid patch format (range
requests), and it supports registering plugins for other custom patch
types (eg ot-json1).