import Foundation

/// The page side of the bridge, injected before the page runs. It defines
/// window.kinboardNative.home, which webapp/src/lib/native-home.ts uses:
///   request(action, params) -> Promise   (page -> app, answered by id)
///   subscribe(listener) -> unsubscribe   (app -> page events)
enum BridgeScript {
    static let source = """
    (function () {
      if (window.kinboardNative) { return; }
      var pending = {};
      var counter = 0;
      var listeners = [];

      window.__kinboardNativeReceive = function (payload) {
        if (payload && payload.replyTo) {
          var entry = pending[payload.replyTo];
          if (!entry) { return; }
          delete pending[payload.replyTo];
          if (payload.error) { entry.reject(new Error(payload.error)); }
          else { entry.resolve(payload.result); }
          return;
        }
        if (payload && payload.event) {
          listeners.slice().forEach(function (listener) {
            try { listener(payload); } catch (e) {}
          });
        }
      };

      window.kinboardNative = {
        platform: 'ios-shell',
        version: 1,
        home: {
          request: function (action, params) {
            return new Promise(function (resolve, reject) {
              var id = 'r' + (++counter);
              pending[id] = { resolve: resolve, reject: reject };
              window.webkit.messageHandlers.homekit.postMessage({ id: id, action: action, params: params || {} });
              setTimeout(function () {
                if (pending[id]) { delete pending[id]; reject(new Error('timeout')); }
              }, 15000);
            });
          },
          subscribe: function (listener) {
            listeners.push(listener);
            return function () {
              listeners = listeners.filter(function (l) { return l !== listener; });
            };
          }
        }
      };
    })();
    """
}
