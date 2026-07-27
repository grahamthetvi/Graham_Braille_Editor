/**
 * Vendored + patched Easy API for Graham Braille Editor.
 *
 * Based on liblouis-js easy-api.js, adapted for modern Emscripten:
 *  - addFunction / removeFunction (no Module.Runtime)
 *  - UTF8ToString (no Pointer_stringify)
 *  - patched translateString buffer sizing / free-on-failure
 *  - injected translate() with outputPos for highlight mapping
 *
 * Loaded in the braille Web Worker after the WASM factory resolves.
 */
(function (root, factory) {
  if (typeof exports === 'object') {
    factory(exports);
  } else if (typeof define === 'function' && define.amd) {
    define(['exports'], factory);
  } else {
    factory((root.liblouis = {}));
  }
})(typeof self !== 'undefined' ? self : this, function (liblouis) {
  'use strict';

  var isBrowserGuiThread = typeof window !== 'undefined';
  var isWebWorker =
    typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
  var isNode = !isBrowserGuiThread && !isWebWorker;

  var capi;
  var TABLE_URL = '';
  var FS_ORIGINAL_LOOKUP = null;

  function utf8FromPtr(ptr) {
    if (typeof capi.UTF8ToString === 'function') return capi.UTF8ToString(ptr);
    if (typeof capi.Pointer_stringify === 'function') return capi.Pointer_stringify(ptr);
    throw new Error('No UTF8 string decoder on liblouis Module');
  }

  function addFn(fn) {
    if (typeof capi.addFunction === 'function') return capi.addFunction(fn, 'vii');
    if (capi.Runtime && typeof capi.Runtime.addFunction === 'function') {
      return capi.Runtime.addFunction(fn);
    }
    throw new Error('addFunction not available on liblouis Module');
  }

  function removeFn(ptr) {
    if (typeof capi.removeFunction === 'function') return capi.removeFunction(ptr);
    if (capi.Runtime && typeof capi.Runtime.removeFunction === 'function') {
      return capi.Runtime.removeFunction(ptr);
    }
  }

  var FS_DYNAMIC_LOOKUP = function dynloader(parent, name) {
    capi.FS.lookup = FS_ORIGINAL_LOOKUP;

    var res;
    if (/(\.cti|\.ctb|\.utb|\.dis|\.uti|\.tbl|\.dic)$/.test(name)) {
      var url = TABLE_URL + name;
      res = capi.FS.createLazyFile(parent, name, url, true, true);
    } else {
      res = capi.FS.lookup.apply(this, [parent, name]);
    }

    capi.FS.lookup = FS_DYNAMIC_LOOKUP;
    return res;
  };

  liblouis.setLiblouisBuild = function setLiblouisBuild(_capi) {
    if (liblouis._log_callback_fn_pointer) {
      removeFn(liblouis._log_callback_fn_pointer);
      liblouis._log_callback_fn_pointer = null;
    }
    capi = _capi;
    liblouis.registerLogCallback(liblouis._log_callback_js_fn || null);

    if (isNode) {
      this.enableOnDemandTableLoading('tables/');
    }

    FS_ORIGINAL_LOOKUP = capi.FS.lookup;
  };

  liblouis.version = function () {
    return capi.ccall('lou_version', 'string', [], []);
  };
  liblouis.setLogLevel = function (num) {
    return capi.ccall('lou_setLogLevel', 'void', ['number'], [num]);
  };
  liblouis.getTable = function (str) {
    return capi.ccall('lou_getTable', 'number', ['string'], [str]);
  };
  liblouis.checkTable = function (str) {
    return capi.ccall('lou_checkTable', 'number', ['string'], [str]);
  };
  liblouis.free = function () {
    return capi.ccall('lou_free', 'void', [], []);
  };
  liblouis.charSize = function () {
    return capi.ccall('lou_charSize', 'number', [], []);
  };
  liblouis.getFilesystem = function () {
    return capi.FS;
  };

  liblouis.registerLogCallback = function (fn) {
    if (liblouis._log_callback_fn_pointer) {
      removeFn(liblouis._log_callback_fn_pointer);
      liblouis._log_callback_fn_pointer = null;
    }

    if (fn === null) {
      fn = easyApiDefaultLogCallback;
    }

    liblouis._log_callback_js_fn = fn;
    liblouis._log_callback_fn_pointer = addFn(function (logLvl, msg) {
      fn(logLvl, utf8FromPtr(msg));
    });

    capi.ccall('lou_registerLogCallback', 'void', ['number'], [
      liblouis._log_callback_fn_pointer,
    ]);
  };

  liblouis.backTranslateString = function (table, inbuf) {
    return liblouis.translateString(table, inbuf, true);
  };

  liblouis.compileString = function (table, str) {
    var success = capi.ccall('lou_compileString', 'number', ['string', 'string'], [
      table,
      str,
    ]);
    return !!success;
  };

  liblouis.translateString = function (table, inbuf, backtranslate) {
    if (typeof inbuf !== 'string' || inbuf.length === 0) {
      return '';
    }

    var mode = 0;
    var char_size = liblouis.charSize() || 2;
    var L = inbuf.length;
    var max_out_len = Math.max(100, L * 10);

    var inbuff_ptr = capi._malloc((L + 1) * char_size);
    var outbuff_ptr = capi._malloc(max_out_len * char_size);

    capi.stringToUTF16(inbuf, inbuff_ptr, (L + 1) * char_size);

    var bufflen_ptr = capi._malloc(4);
    var strlen_ptr = capi._malloc(4);

    capi.setValue(bufflen_ptr, max_out_len, 'i32');
    capi.setValue(strlen_ptr, L, 'i32');

    var success = capi.ccall(
      backtranslate ? 'lou_backTranslateString' : 'lou_translateString',
      'number',
      ['string', 'number', 'number', 'number', 'number', 'number', 'number'],
      [table, inbuff_ptr, strlen_ptr, outbuff_ptr, bufflen_ptr, null, null, mode]
    );

    if (!success) {
      capi._free(outbuff_ptr);
      capi._free(inbuff_ptr);
      capi._free(bufflen_ptr);
      capi._free(strlen_ptr);
      return null;
    }

    var start_index = outbuff_ptr >> 1;
    var end_index = start_index + capi.getValue(bufflen_ptr, 'i32');
    var outstr_buff = capi.HEAP16.slice(start_index, end_index);

    capi._free(outbuff_ptr);
    capi._free(inbuff_ptr);
    capi._free(bufflen_ptr);
    capi._free(strlen_ptr);

    return String.fromCharCode.apply(null, outstr_buff);
  };

  liblouis.translate = function (table, inbuf) {
    if (typeof inbuf !== 'string' || inbuf.length === 0) {
      return { output: '', outputPos: [] };
    }

    var mode = 0;
    var char_size = liblouis.charSize() || 2;
    var L = inbuf.length;
    var max_out_len = Math.max(100, L * 10);

    var inbuff_ptr = capi._malloc((L + 1) * char_size);
    var outbuff_ptr = capi._malloc(max_out_len * char_size);

    capi.stringToUTF16(inbuf, inbuff_ptr, (L + 1) * char_size);

    var inlen_ptr = capi._malloc(4);
    var outlen_ptr = capi._malloc(4);

    capi.setValue(inlen_ptr, L, 'i32');
    capi.setValue(outlen_ptr, max_out_len, 'i32');

    var outputPos_ptr = capi._malloc(L * 4);

    var success;
    try {
      success = capi.ccall(
        'lou_translate',
        'number',
        [
          'string',
          'number',
          'number',
          'number',
          'number',
          'number',
          'number',
          'number',
          'number',
          'number',
          'number',
        ],
        [
          table,
          inbuff_ptr,
          inlen_ptr,
          outbuff_ptr,
          outlen_ptr,
          0,
          0,
          outputPos_ptr,
          0,
          0,
          mode,
        ]
      );
    } catch (e) {
      capi._free(inbuff_ptr);
      capi._free(outbuff_ptr);
      capi._free(inlen_ptr);
      capi._free(outlen_ptr);
      capi._free(outputPos_ptr);
      return null;
    }

    if (!success) {
      capi._free(inbuff_ptr);
      capi._free(outbuff_ptr);
      capi._free(inlen_ptr);
      capi._free(outlen_ptr);
      capi._free(outputPos_ptr);
      return null;
    }

    var actualOutLen = capi.getValue(outlen_ptr, 'i32');

    var start_index = outbuff_ptr >> 1;
    var end_index = start_index + actualOutLen;
    var outstr_buff = capi.HEAP16.slice(start_index, end_index);

    var inLen = inbuf.length;
    var outputPosArr = new Array(inLen);
    var base = outputPos_ptr >> 2;
    for (var i = 0; i < inLen; i++) {
      outputPosArr[i] = capi.HEAP32[base + i];
    }

    capi._free(inbuff_ptr);
    capi._free(outbuff_ptr);
    capi._free(inlen_ptr);
    capi._free(outlen_ptr);
    capi._free(outputPos_ptr);

    return {
      output: String.fromCharCode.apply(null, outstr_buff),
      outputPos: outputPosArr,
    };
  };

  liblouis.loadTable = function (tablename, url) {
    capi.FS.createPreloadedFile('/', tablename, url, true, true);
  };

  liblouis.enableOnDemandTableLoading = function (tableurl) {
    TABLE_URL = tableurl;
    if (!isNode) {
      capi.FS.lookup = FS_DYNAMIC_LOOKUP;
    } else {
      capi.FS.mkdir('/tables');
      var path = require('path');
      capi.FS.mount(
        capi.NODEFS,
        { root: path.resolve(__dirname, 'tables/') },
        tableurl
      );
    }
  };

  liblouis.disableOnDemandTableLoading = function () {
    capi.FS.lookup = FS_ORIGINAL_LOOKUP;
  };

  var _CONSOLE_MAPPING = {
    ALL: 'log',
    DEBUG: 'log',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    FATAL: 'error',
  };

  liblouis.LOG = {};
  liblouis.LOG[(liblouis.LOG.ALL = 0)] = 'ALL';
  liblouis.LOG[(liblouis.LOG.DEBUG = 10000)] = 'DEBUG';
  liblouis.LOG[(liblouis.LOG.INFO = 20000)] = 'INFO';
  liblouis.LOG[(liblouis.LOG.WARN = 30000)] = 'WARN';
  liblouis.LOG[(liblouis.LOG.ERROR = 40000)] = 'ERROR';
  liblouis.LOG[(liblouis.LOG.FATAL = 50000)] = 'FATAL';
  liblouis.LOG[(liblouis.LOG.OFF = 60000)] = 'OFF';

  function easyApiDefaultLogCallback(lvl_id, msg) {
    var lvl_name = liblouis.LOG[lvl_id];
    msg = '[' + lvl_name + '] ' + msg;

    if (console) {
      var fn = console[_CONSOLE_MAPPING[lvl_name]];
      if (fn) {
        fn(msg);
      } else {
        console.log(msg);
      }
    }
  }
});
