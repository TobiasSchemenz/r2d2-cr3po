
codeTest = {
	config: {
		server: '127.0.0.1:8080'
	},
	nickName: 'person1',
	channel: 'defaultChannel',
	client: null
};

jQuery(document).ready(init);


function init() {
	jQuery('#sendMsg').on(
		'click',
		function() {
			sendMsg(jQuery('#message').val());
		}
	);
	jQuery('#setNick').on(
		'click',
		setNick
	);
	jQuery('#joinChannel').on(
		'click',
		joinChannel
	);
	jQuery('#connect').on(
		'click',
		function(e) {
			if (codeTest.client !== null) {
				 // make sure that socket closes.
				codeTest.client.socket.close();
				delete codeTest.client;
			}
			codeTest.config.server = jQuery('#serverUrl').val();
			codeTest.client = setupSocket();
		}
	);
	drawMessage({ author:'system', channel: codeTest.channel, text: 'welcome to the test', timestamp: new Date().toLocaleTimeString() });
};


function joinChannel() {
	var channel = jQuery('#channel').val();
	jQuery('#messages').empty();
	codeTest.channel = channel;
	drawMessage({ author:'system', channel: codeTest.channel, text: 'welcome to a new channel (' + channel + '), ' + codeTest.nickName, timestamp: new Date().toLocaleTimeString() });
	// send message to server to change channel subscription
	// it's more efficient than filtering through messages afterwards.
	codeTest.client.send({command:'msg', data:[{type:"cc",channel:codeTest.channel}]});
	return codeTest.channel;
};


function setNick() {
	var nick = jQuery('#nickname').val();
	codeTest.nickName = nick;
	drawMessage({ author:'system', channel: codeTest.channel, text: 'greetings, ' + nick + '!', timestamp: new Date().toLocaleTimeString() });
	return codeTest.nickName;
};


function sendMsg(text) {
	var data = {
		author: codeTest.nickName,
		channel: codeTest.channel,
		text: text,
		timestamp: new Date().toLocaleTimeString() //added timestamp
	};
	drawMessage({ author:'YOU', channel: data.channel, text: data.text, timestamp: data.timestamp});
	return send2server('msg', data);
};


function send2server(command, data) {
	return codeTest.client.send(
		{
			command:command,
			data: [
				{
					author: codeTest.nickName,
					channel: codeTest.channel,
					text: data.text,
					timestamp: data.timestamp //added timestamp
				}
			]
		}
	);
};


function handleMessageFromServer(msg) {
	if (typeof msg.command !== 'undefined' && typeof msg.data !== 'undefined') {
		if (msg.command === 'messages') {
			for (var n=0; n<msg.data; n+=1) {
				drawMessage(msg.data[n]);
			}
		}
	}
};


function drawMessage(data) {
	var msgString = '<span>{' + data.channel + '@' + data.timestamp + '} [' + data.author + '] ' + data.text + '</span><br/>';
	jQuery('#messages').append(msgString);
};


function setupSocket() {
	try {
		var testSocket = new Socket(codeTest.config.server, { autoReconnect: false });
		// true autoReconnect did not close sockets when it was supposed to.

		testSocket.on('reconnect', function(msg, e) {
			console.log('reconnected');
		});
		testSocket.on('close', function(e) {
			console.log('[close]');
			jQuery('#wsstatus').text(Date.now() + ' connection closed');
		});
		testSocket.on('error', function(e) {
			console.log('[error]');
			jQuery('#wsstatus').text(Date.now() + ' connection error');
		});
		testSocket.on('open', function(e) {
			jQuery('#wsstatus').text(Date.now() + ' connection open');
			console.log('[open]');
			testSocket.on('message', function(msg, e) {
				console.log('[message]');
				console.log(msg);
				handleMessageFromServer(msg);
			});
			jQuery('#messages').empty();
			// send message to server to change channel subscription
			// it's more efficient than filtering through messages afterwards.
			codeTest.client.send({command:'msg', data:[{type:"cc",channel:codeTest.channel}]});
		});
		testSocket.on('message', function(e){
			// console.log(e);
			// console.log(e.action.data);
			// receive message/s, write it/them in the chat. Make sure it's/they're in the same channel as client.
			for(var d in e.action.data){
				if(e.action.data[d].channel == codeTest.channel){
					drawMessage(e.action.data[d]);
				}
			}
		});
		jQuery('#wsstatus').text(Date.now() + ' connecting to [' + codeTest.config.server + ']');
	} catch(err) {
		jQuery('#wsstatus').text(Date.now() + ' connection failed: ' + err);
	}
	return testSocket;
};
