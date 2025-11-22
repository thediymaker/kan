
import { S3Client, ListBucketsCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import path from "path";

import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Explicitly load .env from the root directory
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const s3 = new S3Client({
  region: process.env.S3_REGION ?? "auto",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
});

async function main() {
  try {
    console.log("--- S3 Connection Test ---");
    console.log(`Endpoint: ${process.env.S3_ENDPOINT}`);
    console.log(`Region: ${process.env.S3_REGION}`);
    console.log(`Force Path Style: ${process.env.S3_FORCE_PATH_STYLE}`);
    console.log(`Access Key ID: ${process.env.S3_ACCESS_KEY_ID?.substring(0, 5)}...`);

    console.log("\n1. Attempting to list buckets...");
    const data = await s3.send(new ListBucketsCommand({}));
    
    console.log("Success! Buckets found:");
    data.Buckets?.forEach((b) => console.log(` - ${b.Name}`));

    // The code expects a bucket named "card-attachments"
    const targetBucket = "card-attachments";
    const bucketExists = data.Buckets?.some(b => b.Name === targetBucket);

    if (!bucketExists) {
        console.warn(`\nWARNING: The expected bucket '${targetBucket}' was NOT found in the bucket list.`);
        console.warn("Your code in 'packages/api/src/routers/card.ts' hardcodes this bucket name.");
        console.warn("You should create this bucket in Cloudflare R2 or update the code to use the correct bucket name.");
    } else {
        console.log(`\nBucket '${targetBucket}' exists.`);
    }

  } catch (err) {
    console.error("\n❌ Error connecting to S3/R2:", err);
    
    if (err.name === "SignatureDoesNotMatch" || err.name === "InvalidAccessKeyId") {
        console.log("\n💡 Check your Access Key ID and Secret Access Key.");
        console.log("   Your Access Key ID in .env looks suspiciously like your Account ID.");
        console.log("   In Cloudflare R2, the Access Key ID is usually different from the Account ID.");
    }
  }
}

main();

