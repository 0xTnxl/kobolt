import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
const kp = Keypair.generate();
console.log("ESCROW_ADDRESS=" + kp.publicKey.toBase58());
console.log("ESCROW_SECRET_KEY=" + bs58.encode(kp.secretKey));
