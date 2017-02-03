window.Socket = (function(){

  var config = {

        retryTimer    : 5000,
        autoReconnect : false,
        serialization : null
      },

      WEBSOCKET_STATES = {

        'connecting'  : 0,
        'open'        : 1,
        'closing'     : 2,
        'closed'      : 3
      };


  /**
   *  vwc.Socket - Wrapper Constructor
   *
   *  @param { Object } server    - server address / information for this socket
   *  @param { Object } options   - additional configurations for the connection
   */
  var Socket = function ( server, options ) {

    this.server = ( typeof server === 'string' ) ?  { server: server } : server;

    for ( var keys in options ) config[keys] = options[keys];

    this.config       = config;

    this.id           = null;

    this.last         = null;

    this.messageQueue = [];

    this.info         = prepareInfo();

    connect.call( this );
  };


  /**
   *  [on description]
   *  @param  {[type]}   topic    [description]
   *  @param  {Function} callback [description]
   *  @return {[type]}            [description]
   */
  Socket.prototype.on = function ( topic, callback ) {

    callback = decode.call( this, callback );

    this.handler[ topic ].push( callback );
  };


  /**
   *  [off description]
   *  @param  {[type]}   topic    [description]
   *  @param  {Function} callback [description]
   *  @return {[type]}            [description]
   */
  Socket.prototype.off = function ( topic, callback ) {

    var listeners = this.handler[ topic ];

    if ( !listeners ) return;

    if ( !callback ) {

      listeners.length = 0;

    } else {

      var length = listeners.length;

      while ( length-- ) {

        if ( listeners[ length ] === callback ) {

          listeners.splice( length, 1 ); break;
        }
      }

    }
  };


  /**
   *  [reconnect description]
   *  @param  {[type]} e [description]
   *  @return {[type]}   [description]
   */
  Socket.prototype.reconnect = function ( e ) {

    // can't call reconnect as it still is reconnecting
    if ( this.reconnectID ) return;

    // connection still there - close existing one
    if ( this.socket.readyState !== WEBSOCKET_STATES['closed']  ) {

      this.socket.close();
    }

    this.reconnectID = setInterval( reconnect.bind(this), this.config.retryTimer );
  };


  /**
   *  [send description]
   *  @param  {[type]} msg [description]
   *  @return {[type]}     [description]
   */
  Socket.prototype.send = function ( action, data ) { // prev. msg

    var encoder = JSON.stringify; //this.config.serialization

    msg = encoder({ id: this.id, action: action, data: data });

    this.messageQueue.push( msg );

    if ( this.socket.readyState !== WEBSOCKET_STATES['open'] ) return;

    transfer.call(this);
  };


  /**
   *  [prepareInfo description]
   *  @return {[type]} [description]
   */
  function prepareInfo(){

    var info = {

      lastPing    : null,
      latency     : null,
      bandwidth   : null,
      extensions  : null,

      reconnected : false
    };

    // duration of the connection
    Object.defineProperty( info, 'duration', {

      get: function(){

        return Date.now() - this._start;
      }
    });

    return info;
  }


  /**
   *  [connect description]
   *  Creating the socket for connection
   *  @return {[type]} [description]
   */
  function connect() {
		var server = this.server,	socket;
		var wsProtocol = (server.ssl) ? 'wss://' : 'ws://' ;
		try {
			if ( server.server ) {
				socket = new WebSocket( wsProtocol + server.server );
			} else {
				socket = new WebSocket( wsProtocol + server.url + ':' + server.port + '/?' + ( server.parameters || '' ), server.protocol || null );
			}
		} catch ( e ) {
			socket.emit('error', 'bad connection');
			throw new Error( e );
		}
		this.socket = socket;
		init.call( this, this.config.autoReconnect );
  }


  /**
   *  [init description]
   *  @param  {[type]} autoReconnect [description]
   *  @return {[type]}               [description]
   */
  function init ( autoReconnect ) {

    var socket  = this.socket,
        events  = [ 'open', 'message', 'close', 'error' ],
        handler = this.handler || {};     // ~ reconnect

    for ( var i = 0, l = events.length; i < l; i++ ) {

      if ( !handler[ events[i] ] ) handler[ events[i] ] = [];
      socket.addEventListener( events[i], handle.bind(this) );
    }


    if ( this.handler ) {                 // ~ reconnect

      if ( this.info.reconnected ) return;

      this.info.reconnected = true;

      handler.reconnect.push( function(){

        this.info._start = Date.now();

        transfer.call(this);

      }.bind(this) );

      handler.open = handler.reconnect;

      return;
    }


    if ( autoReconnect ) {

      handler.open.push( function(){

        this.info._start = Date.now();

        handler.close.push( this.reconnect.bind( this ) );

      }.bind(this));
    }

    handler.reconnect = [];
    this.handler = handler;


    // delegate
    function handle ( e ) {

      if ( !this.id && typeof e.data !== 'undefined') return register.call( this, e.data );

       // prevent multiple firing
      if ( e.type === this.last && e.type === 'close' ) return;

      this.last = e.type;

      var channel = handler[ e.type ];

      if ( channel.length ) {

        for ( var i = 0, l = channel.length; i < l; i++ ) channel[i]( e );
      }
    }
  }


  // initial
  function register ( id ) {

    if ( !id ) return;  // open

    this.id = id;

    emit.apply( this, [ 'open', id ] );
  }


  /**
   *  [emit description]
   *  @param  {[type]} topic [description]
   *  @param  {[type]} data  [description]
   *  @return {[type]}       [description]
   */
  function emit ( topic, data ) {

    var listeners = this.handler[ topic ],

        length    = listeners.length;

    while ( length-- ) listeners[length]( data );
  }


  /**
   *  [decode description]
   *  @param  {Function} callback [description]
   *  @return {[type]}            [description]
   */
  function decode ( callback ) {

    return function ( e ) {

      if ( !e || !e.data ) return callback();

      var msg = e.data;

      try {

        var decoder = JSON.parse;

        msg = decoder( msg );

      } catch ( err ) {

        throw new Error( err );
      }

      callback( msg, e );

    }.bind(this);
  }


  /**
   *  [transfer description]
   *  @return {[type]} [description]
   */
  function transfer(){

    var messageQueue  = this.messageQueue,
        socket        = this.socket;

    while ( messageQueue.length ) socket.send( messageQueue.shift() );
  }


  /**
   *  [reconnect description]
   *  @return {[type]} [description]
   */
  function reconnect(){

    if (  this.socket.readyState !== WEBSOCKET_STATES['connecting'] &&
          this.socket.readyState !== WEBSOCKET_STATES['open']         ) {

      connect.call( this );

    } else {

      clearInterval( this.reconnectID );
      delete this.reconnectID;
    }
  }


  return Socket;

})();
