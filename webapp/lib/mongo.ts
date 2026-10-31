import { MongoClient } from "mongodb";

const g = globalThis as unknown as { mongoClient?: Promise<MongoClient> };

function client(): Promise<MongoClient> {
  if (!g.mongoClient) {
    g.mongoClient = new MongoClient(process.env.MONGODB_URI as string).connect();
  }
  return g.mongoClient;
}

export async function mongoDb() {
  return (await client()).db("study_repo");
}
