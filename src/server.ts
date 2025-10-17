import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import http from "http";
import { main } from "tcp/uses";
import { loadRoutes } from "utils/loadRoutes";
import { KafkaManager } from "./kafka/kafkaManager";
import { SocketManager } from "./socket/socketManager";

const app = express();
const server = http.createServer(app);

app.use(
  cors({
    origin: "*",
  })
);

const brokers = (process.env.KAFKA_BROKERS || "localhost:9092").split(",");
const kafkaClientId = process.env.KAFKA_CLIENT_ID || "my-app";
const kafkaGroupId = process.env.KAFKA_GROUP_ID || "my-group";
// instantiate managers
const kafkaManager = new KafkaManager(brokers, kafkaClientId, kafkaGroupId);

// create SocketManager (attaches to HTTP server)
const socketManager = new SocketManager(server, kafkaManager, {
  kafkaTopicPrefix: "socket.events",
});

const PORT = process.env.SERVER_PORT || 5000;

async function start() {
  // Example: subscribe to wildcard-like topics by explicitly creating subscribers for topics you care about
  // If you need dynamic wildcard subscription, Kafka doesn't support regex topics directly;
  // instead programmatically subscribe to a list of topics or use a prefix topic pattern in newer brokers.
  // Here we subscribe to an example topic where other services publish messages to be forwarded to sockets.
  const forwardTopic = "socket.events.chat.message";
  await socketManager.bindKafkaTopicToSockets(forwardTopic);

  // Another example: subscribe to server-side control topic to broadcast to all
  await socketManager.bindKafkaTopicToSockets("socket.events.broadcast");

  // if (typeof kafkaManager.start === "function") {
  //   await kafkaManager.start();
  // }

  // Add JSON middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await main();
  await loadRoutes(app);

  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });

  const shutdown = async () => {
    console.log("Shutting down...");
    await socketManager.close();
    await kafkaManager.disconnect();
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((err) => {
  console.error("Startup error", err);
  process.exit(1);
});
