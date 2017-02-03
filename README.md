# Code-Challenge

This should be enough to get two server instances running:

<code>npm install && docker-compose build && docker-compose up</code>

You can open two browser windows with client.html and connec to 'localhost:8080' and 'localhost:8081'. I tested it with the current Firefox browser.

My approach was to use the pub/sub implementation of redis. Anytime a client sends a message, the connected server socket publishes that its timestamp to the appropriate channel on redis. The message itself is saved in a set of messages with the same <channel\>-<timestamp\> key, thus avoiding duplicates. Server sockets subscribed to the given channel notice the change event and send that message to its respective client.
