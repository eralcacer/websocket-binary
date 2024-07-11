import { createServer } from "http";
import crypto from "crypto";
import { buffer } from "stream/consumers";

const PORT = 1337;
const WEBSOCKET_MAGIC_STRING_KEY = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const SEVEN_BITS_INTEGER_MARKER = 125;
const SIXTEEN_BITS_INTEGER_MARKER = 126;
const SIXTYFOUR_BITS_INTEGER_MARKER = 127;

const MAXIMUM_SIXTEENBITS_INTEGER = 2 ** 16; // 0 to 65536
const MASK_KEY_BYTES_LENGTH = 4;
const OPCODE_TEXT = 0x01; // 1 bit in binary

// parseInt('10000000', 2) number of bits in JavaScript
const FIRST_BIT = 128;

const server = createServer((req, response) => {
  response.writeHead(200);
  response.end("Hello World!");
}).listen(1337, () => console.log(`Server listening to port: ${PORT}`));

server.on("upgrade", onSocketUpgrade);

function onSocketUpgrade(req, socket, head) {
  const { "sec-websocket-key": webSocketClientKey } = req.headers;
  console.log(`${webSocketClientKey} connected!`);
  const headers = prepareHandShakeHeaders(webSocketClientKey);
  socket.write(headers);
  socket.on("readable", () => onSocketReadable(socket));
}

function sendMessage(msg, socket) {
  const dataFrameBuffer = prepareMessage(msg);
  socket.write(dataFrameBuffer);
}

function prepareMessage(message) {
  const msg = Buffer.from(message);
  const messageSize = msg.length;

  let dataFrameBuffer;

  // 0x80 === 128 binary
  // "0x" + Math.abs(128).toString(16) === 0x80
  const firstByte = 0x80 | OPCODE_TEXT; // single frame + text
  if (messageSize <= SEVEN_BITS_INTEGER_MARKER) {
    const bytes = [firstByte];
    dataFrameBuffer = Buffer.from(bytes.concat(messageSize));
  } else if (messageSize <= MAXIMUM_SIXTEENBITS_INTEGER) {
    const offsetFourBytes = 4;
    const target = Buffer.allocUnsafe(offsetFourBytes);
    target[0] = firstByte;
    target[1] = SIXTEEN_BITS_INTEGER_MARKER | 0x0; // just to know the mask

    target.writeUInt16BE(messageSize, 2);
    dataFrameBuffer = target;
    /**
     * alloc 4 bytes
     * [0] - 128 + 1 - 1000001 =  0x81 fin + opcode
     * [1] - 126 + 0 - payload length marker + mask indicator
     * [2] 0 - content length
     * [3] 113 - content length
     * [4 - ...] - the message itself
     */
  } else {
    throw new Error("Message too long :( ");
  }
  const totalLength = dataFrameBuffer.byteLength + messageSize;
  const dataFrameResponse = concat([dataFrameBuffer, msg], totalLength);

  return dataFrameResponse;
}

function concat(bufferList, totalLength) {
  const target = Buffer.allocUnsafe(totalLength);
  let offset = 0;
  for (const buffer of bufferList) {
    target.set(buffer, offset);
    offset += buffer.length;
  }

  return target;
}

//Socket is ready to read data
function onSocketReadable(socket) {
  // consume optcode (first byte)
  // 1 - 1 byte - 8bits
  socket.read(1);

  const [markerAndPayloadLength] = socket.read(1);
  // Because the first bit is always 1 for client to server messages
  // you can substracte 1 bit (128 or "10000000") from this byte to
  // get rid of the MASK bit
  const lengthIndicatorInBits = markerAndPayloadLength - FIRST_BIT;

  let messageLength = 0;
  if (lengthIndicatorInBits <= SEVEN_BITS_INTEGER_MARKER) {
    messageLength = lengthIndicatorInBits;
  } else if (lengthIndicatorInBits === SIXTEEN_BITS_INTEGER_MARKER) {
    // unsigend, big-ending 16-bit integer [0 - 65k] - 2 ** 16
    messageLength = socket.read(2).readUint16BE(0);
  } else {
    throw new Error(
      "Your message is too long. We can't handle 64 bits messages."
    );
  }

  const maskKey = socket.read(MASK_KEY_BYTES_LENGTH);
  const encoded = socket.read(messageLength);
  const decoded = unmask(encoded, maskKey);
  const received = decoded.toString("utf-8");

  const data = JSON.parse(received);
  console.log("message received!", data);

  const msg = JSON.stringify({
    message: data,
    date: new Date().toISOString(),
  });
  sendMessage(msg, socket);
}

function unmask(encodedBuffer, maskKey) {
  // Because mask key has only 4 bytes
  // index % 4 === 0, 1, 2, 3 = index bits needed to decode the message

  /**
   * XOR ^
   * Returns 1 if both are different or 0 if both are equal
   * (71).parseInt(2).padStart(8, "0") = 01000111
   * (53).parseInt(2).padStart(8, "0") = 00110101
   *                                     01110010 => parseInt(01110010) = 114
   * String.fromCharCode(parseInt("01110010", 2))
   * (71 ^ 53).toString().padStart(8, "0")
   */
  const fillWithEightZeros = (t) => t.padStart(8, "0");
  const toBinary = (t) => fillWithEightZeros(t.toString(2));
  const fromBinaryToDecimal = (t) => parseInt(toBinary(t), 2);
  const getCharFromBinary = (t) => String.fromCharCode(fromBinaryToDecimal(t));
  const finalBuffer = Buffer.from(encodedBuffer);
  for (let index = 0; index < encodedBuffer.length; index++) {
    finalBuffer[index] =
      encodedBuffer[index] ^ maskKey[index % MASK_KEY_BYTES_LENGTH];

    const logger = {
      unmaskingCalc: `${toBinary(encodedBuffer[index])} ^ ${toBinary(
        maskKey[index % MASK_KEY_BYTES_LENGTH]
      )} = ${toBinary(finalBuffer[index])}`,
      decoded: getCharFromBinary(finalBuffer[index]),
    };
    console.log(logger);
  }

  return finalBuffer;
}

function prepareHandShakeHeaders(id) {
  const acceptKey = createSocketAccept(id);
  const headers = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${acceptKey}`,
    "",
  ]
    .map((line) => line.concat("\r\n"))
    .join("");
  return headers;
}

function createSocketAccept(id) {
  const shaum = crypto.createHash("sha1");
  shaum.update(id + WEBSOCKET_MAGIC_STRING_KEY);
  return shaum.digest("base64");
}

// error handling to keep server on
["uncaughtException", "unhandledRejection"].forEach((event) =>
  process.on(event, (err) => {
    console.error(
      `Something bad happened! event: ${event}, msg: ${err.stack || err}`
    );
  })
);
