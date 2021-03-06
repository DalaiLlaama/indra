/* tslint:disable */

// A common entrypoint for all components.
// Sets up global (& window) overrides, etc

// Bluebird has the ability to include the entire call stack in a Promise
// (ie, including the original caller).
// This incurs a 4x-5x performance penalty, though, so only use it in dev +
// staging... but use Bluebird promises unconditionally to minimize the
// differences between production, staging, and dev.
global.Promise = require('bluebird')
if (process.env.NODE_ENV !== 'production') {
  (Promise as any).longStackTraces()
}
