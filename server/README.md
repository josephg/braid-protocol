# Braid protocol server

This is a simple reference implementation of the [braid](https://github.com/braid-org/braid-spec/) protocol for nodejs.

Usage:

```
npm i --save josephg/braid-server
```

The braid server works to stream a series of values or patches to any client using any nodejs response object. This is compatible with express / connect / polka / etc. Eg, with polka:

```javascript
const polka = require('polka')
const sirv = require('sirv')
const cors = require('cors')
const braid = require('@braid-protocol/server')

const assets = sirv(__dirname + '/web')

const getDate = () => new Date().toLocaleString() + '\n'

polka()
  .options('/time', cors({methods: ['GET']}))
  .get('/time', cors(), (req, res) => {
    let timer

    if (req.headers.subscribe === 'keep-alive') {
      const stream = braid.stream(res, {
        initialValue: getDate(),
        contentType: 'text/plain',
        onclose() {
          clearInterval(timer)
        },
      })

      timer = setInterval(() => {
        stream.append({ value: getDate() })
      }, 1000)
    } else {
      res.end(getDate())
    }
  })
  .use(assets)
  .listen(2001, (err) => {
    if (err) throw err
    console.log('listening on http://localhost:2001/time')
    console.log('Open http://localhost:2001/ in a browser for a simple demo')
  })
```
