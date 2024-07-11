# Websocket connection handling messages in bits

## Description

This project implements a basic WebSocket server using Node.js. The server listens for HTTP upgrade requests to establish WebSocket connections, allowing for real-time, bidirectional communication between the server and clients.


### Use Case

This WebSocket server can be used as a starting point for real-time applications such as chat apps, live notifications, online gaming, and other scenarios where low-latency, bidirectional communication between the client and server is required.

## Detailed Functionality:

- WebSocket Handshake:
  - Uses the Sec-WebSocket-Key from the client request headers to generate the Sec-WebSocket-Accept header using a SHA-1 hash combined with a magic string.
  - Sends the handshake response headers to the client to confirm the WebSocket connection.

- Message Preparation and Sending:
  - Encodes the message into a WebSocket frame format, handling single-frame text messages.
  - Writes the encoded message to the WebSocket connection.

- Message Decoding:
  - Reads the opcode and payload length from the WebSocket frame.
  - Reads and unmasks the payload data using the mask key provided in the frame.
  - Converts the decoded data into a UTF-8 string and attempts to parse it as JSON.


## What did I learn?

💡 I learned about integrating handshake communication between server and client

💡 I learned how about message handling in WebSocket frame format

💡 I learned bits positioning on WebSocket data frames and how they are encoded and decoded


Big Thanks [^1].
[^1]: Big thanks to @ErickWendel for documenting this tutorial on his repository websockets-with-nodejs-from-scratch
