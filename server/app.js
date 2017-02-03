var redis = require('redis'),
    socketServer = require('../server/vws.socket.js').server;

var config = {port: 8080};
var redisClient = redis.createClient('6379','redis');

var example = socketServer( 'example', function ( connection, server ) {
  connection.on('open', function ( id ) {
    console.log('[open: '+id+']');
  });

  var channel;
  // creating clients for listening
  var redisSubscription = redis.createClient('6379','redis');
  var redisPublisher = redis.createClient('6379','redis');

  // callback function for pub/sub
  var callback = function(channel, data){
      // upon change event, send new messages to connection
      redisClient.smembers(channel+"-"+data,function(er,rep){
          for(var msg in rep){
              // make sure that you don't send messages to the sender
              if (connection.id!=JSON.parse(rep[msg]).id){
                  connection.send(rep[msg]);
              }
          }
      });
  }

  /*

  app.js was an example in the r2d2-master repository and I changed fairly little about it.
  The only thing I added was a connection to the redis-server, and I changed the message method.

  There wasn't really anything particularly complicated about this task. I wasn't familiar with redis, so I had to do some research there. Once I was familiar enough with it, the architecture didn't take very long to design, maybe 30 minutes. Implementing the code took much longer. As indicated below, the subscription didn't work as I had wanted it to.
  I had to familiarize myself with the existing code (particularly vws.socket.js) as well, which took more time since it isn't very well commented. As it was, it didn't close sockets when it was supposed to, which lead to clients creating several server sockets, and thus receiving messages several times (including their own). For whatever reason, finicking around with the websockets took me several hours.

  I think overall, getting everything to work took me 6 hours.

  */

  connection.on('message', function ( msg ) {
    console.log('[message]');
    //console.log(msg.utf8Data);
    utf8Data = JSON.parse(msg.utf8Data);
    // unlikely, but possible
    if(utf8Data.id == null){
        return;
    }
    // channel changes
    if(utf8Data.action.data[0].type == "cc"){
        if(channel != utf8Data.action.data[0].channel){

            /*
                When I tried to bind the subscription to the timestamp list, redis returned various queue errors that I wasn't able to solve.
                In the end, I decided to use up slightly more memory space. Ideally, I would try to solve this issue, though.
            */
            // unsubscribe from old channel and subscribe to new channel
            redisSubscription.unsubscribe();
            channel = utf8Data.action.data[0].channel;
            redisSubscription.subscribe(channel);
            redisSubscription.on("message",callback);


            // go through list of times in channel
            redisClient.lrange(channel,-20,-1,function(err,reply){
                var msgs = [];
                for(var r in reply){
                    // go through set of messages for each time of channel
                    redisClient.smembers(reply[r],function(er,rep){
                        connection.send(rep)
                    });
                }

            });
        }else{
            // show the last <X> times of the channel
            redisClient.lrange(channel,-20,-1,function(err,reply){
                var msgs = [];
                for(var r in reply){
                    // send all messages that happened during those times
                    redisClient.smembers(reply[r],function(er,rep){
                        connection.send(rep)
                    });
                }

            });
        }
    }else{
        if(channel != utf8Data.action.data[0].channel){
            redisSubscription.unsubscribe();
            channel = utf8Data.action.data[0].channel;
            redisSubscription.subscribe(channel);
        }
        time = utf8Data.action.data[0].timestamp;


        /*
            reasons for using one list of timestamps for each channel plus one set for each timestamp per channel:
            - separating message lists for channels is more efficient than having to filter through them after the fact.
            - sets avoid duplicates. since the timestamp doesn't count miliseconds, double posts don't matter
            - we need keys to find any given message. redis has a function for going through all keys, but it's inefficient. collecting the timestamps in lists allows us to find messages sorted by time and grouped by channel. list items don't have an expiration date, so it seemed more efficient to have a list of small keys link towards 'large' sets, than have a list of 'large' items that don't expire at all, unless we do it manually. A garbage collector could hourly/daily run through the lists to remove expired items, but I tried to keep it simple.

        */
        // add message to set '<channel>-<timestamp>'
        redisClient.sadd(channel+"-"+time, msg.utf8Data,function(err,reply){
            //console.log("sadd time ("+reply+"): "+channel+"-"+time+": utf8Data");
        });
        // set expiration time to 24 hours (24*60*60 seconds = 86400 seconds)
        redisClient.expire(channel+"-"+time, 86400);
        // push timestamp to list '<channel>'
        redisClient.rpush(channel,channel+"-"+time,function(err,reply){
        });
        // publish timestamp on channel
        redisPublisher.publish(channel, time);
    }
  });

  connection.on('error', function ( err ) {
    console.log(err);
  });

  connection.on('close', function(){
    delete server.connections[connection];
    console.log('[close: '+connection.id+']');
});
});

example.config( config);
