"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ministreamiterator_1 = __importDefault(require("ministreamiterator"));
const writeHeaders = (stream, headers) => {
    stream.write(Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join('')
        + '\r\n');
};
/*

Switches:

- Are we sending snapshots or are we sending patches?
- When is the client up-to-date?

- The client can request changes from some specified version
- And the updates can name a version

- Patch type can change per message (according to the current braid spec)

- Client can send accepts-patch header to name which patch types it understands

*/
function stream(res, opts = {}) {
    // These headers are sent both in the HTTP response and in the first SSE
    // message, because there's no API for reading these headers back from
    // EventSource in the browser.
    var _a;
    const httpHeaders = {
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
        ...opts.httpHeaders
    };
    let contentType = (_a = opts.contentType) !== null && _a !== void 0 ? _a : null;
    if (contentType != null)
        httpHeaders['content-type'] = contentType;
    if (opts.patchType)
        httpHeaders['patch-type'] = opts.patchType;
    res.writeHead(209, 'Subscription', httpHeaders);
    let connected = true;
    const stream = ministreamiterator_1.default(() => {
        connected = false;
        res.end(); // will fire res.emit('close') if not already closed
    });
    res.once('close', () => {
        var _a;
        connected = false;
        stream.end();
        (_a = opts.onclose) === null || _a === void 0 ? void 0 : _a.call(opts);
    });
    (async () => {
        var _a;
        if (connected) {
            for await (const val of stream.iter) {
                if (!connected)
                    break;
                // console.log('got val', val)
                const data = Buffer.from(`${val.data}\n`, 'utf8');
                const patchHeaders = {
                    // 'content-type': 'application/json',
                    // 'patch-type': 'snapshot',
                    'content-length': `${data.length}`,
                    ...val.headers
                };
                if (val.version)
                    patchHeaders['version'] = val.version;
                writeHeaders(res, patchHeaders);
                res.write(data);
                (_a = res.flush) === null || _a === void 0 ? void 0 : _a.call(res);
            }
        }
    })();
    // let headersSent = false
    const append = (patch, version) => {
        if (!connected)
            return;
        let message = { data: patch };
        if (version != null)
            message.version = version;
        // console.log('append', message)
        stream.append(message);
    };
    if (opts.initialValue !== undefined) {
        append(opts.initialValue, opts.initialVerson);
    }
    return { stream, append };
}
exports.default = stream;
module.exports = stream;
//# sourceMappingURL=server.js.map