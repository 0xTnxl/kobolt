// Per-deal escrow on Solana, no custom programs.
//  - Treasury key: pays fees only.
//  - Deal owner key: derived per deal (HMAC of treasury secret). Owns the deal's USDC account.
//  - Agent key: SPL delegate on each deal account, allowance = held amount. The token program,
//    not our code, caps what the agent can move. A leaked agent key cannot drain other deals.
import crypto from "crypto";
import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction, createApproveCheckedInstruction, getAccount,
} from "@solana/spl-token";
import bs58 from "bs58";
import { USDC_MINT } from "./paj";
import { AppError } from "./errors";

const MINT = new PublicKey(USDC_MINT);
const DECIMALS = 6;
const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

let _conn: Connection | null = null;
export function connection() {
  if (!_conn) {
    const url = process.env.SOLANA_RPC_URL;
    if (!url) throw new AppError("CONFIG", "SOLANA_RPC_URL missing", "set_env", 500);
    _conn = new Connection(url, "confirmed");
  }
  return _conn;
}

const keyFromEnv = (name: string) => {
  const sk = process.env[name];
  if (!sk) throw new AppError("CONFIG", `${name} missing`, "set_env", 500);
  return Keypair.fromSecretKey(bs58.decode(sk));
};
let _t: Keypair | null = null, _a: Keypair | null = null;
export const treasury = () => (_t ??= keyFromEnv("ESCROW_SECRET_KEY"));
export const agent = () => (_a ??= keyFromEnv("AGENT_SECRET_KEY"));

export function dealOwner(dealId: string) {
  const seed = crypto.createHmac("sha256", Buffer.from(treasury().secretKey)).update(`kobolt:deal:${dealId}`).digest();
  return Keypair.fromSeed(seed);
}
export const dealWallet = (dealId: string) => dealOwner(dealId).publicKey.toBase58();
export const dealAta = (dealId: string) => getAssociatedTokenAddressSync(MINT, dealOwner(dealId).publicKey, true);

export async function treasuryBalances() {
  const c = connection();
  const lamports = await c.getBalance(treasury().publicKey);
  return { address: treasury().publicKey.toBase58(), agent: agent().publicKey.toBase58(), sol: lamports / 1e9 };
}

// Sign, send, and confirm. On ambiguous errors, check the signature status before giving up,
// so we never report "failed" for a transfer that actually landed.
async function send(ixs: TransactionInstruction[], signers: Keypair[]): Promise<string> {
  const c = connection();
  const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: treasury().publicKey, blockhash, lastValidBlockHeight });
  // Explicit CU limit keeps priority fees tiny (~0.000005 SOL/tx) while still landing fast.
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 120_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }), ...ixs);
  tx.sign(treasury(), ...signers.filter((s) => !s.publicKey.equals(treasury().publicKey)));
  const sig = bs58.encode(tx.signature!);
  try {
    await c.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
    const r = await c.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    if (r.value.err) throw new AppError("CHAIN_TX_FAILED", JSON.stringify(r.value.err), "inspect_tx", 502);
    return sig;
  } catch (e) {
    if (e instanceof AppError) throw e;
    const st = await c.getSignatureStatus(sig, { searchTransactionHistory: true }).catch(() => null);
    if (st?.value && !st.value.err && st.value.confirmationStatus) return sig;
    throw new AppError("CHAIN_TX_UNCONFIRMED", `${sig}: ${String(e)}`, "verify_onchain_then_resolve", 502);
  }
}

export async function prepareDealAccount(dealId: string) {
  const owner = dealOwner(dealId).publicKey;
  const ata = dealAta(dealId);
  if (!(await connection().getAccountInfo(ata))) {
    await send([createAssociatedTokenAccountIdempotentInstruction(treasury().publicKey, ata, owner, MINT)], []);
  }
  return { wallet: owner.toBase58(), tokenAccount: ata.toBase58() };
}

export async function dealBalanceMicro(dealId: string) {
  try {
    const acc = await getAccount(connection(), dealAta(dealId), "confirmed");
    return { amount: Number(acc.amount), delegate: acc.delegate?.toBase58() ?? null, delegated: Number(acc.delegatedAmount) };
  } catch {
    return { amount: 0, delegate: null, delegated: 0 };
  }
}

export async function latestDealSignature(dealId: string) {
  const s = await connection().getSignaturesForAddress(dealAta(dealId), { limit: 1 });
  return s[0]?.signature ?? null;
}

/** Owner grants the agent a capped allowance on this one deal account. */
export async function approveAgent(dealId: string, micro: number) {
  const owner = dealOwner(dealId);
  return send([createApproveCheckedInstruction(dealAta(dealId), MINT, agent().publicKey, owner.publicKey, BigInt(micro), DECIMALS)], [owner]);
}

const memoIx = (memo: string, signer: PublicKey) =>
  new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [{ pubkey: signer, isSigner: true, isWritable: false }], data: Buffer.from(memo, "utf8") });

/** Move USDC out of a deal account. by="agent" signs as delegate (capped by allowance); by="owner" for human overrides/refunds. */
export async function transferFromDeal(dealId: string, to: string, micro: number, by: "agent" | "owner", memo: string) {
  if (!Number.isInteger(micro) || micro <= 0) throw new AppError("BAD_AMOUNT", "invalid amount", "fix_amount");
  const auth = by === "agent" ? agent() : dealOwner(dealId);
  const dest = new PublicKey(to);
  const destAta = getAssociatedTokenAddressSync(MINT, dest, true);
  return send(
    [
      createAssociatedTokenAccountIdempotentInstruction(treasury().publicKey, destAta, dest, MINT),
      createTransferCheckedInstruction(dealAta(dealId), MINT, destAta, auth.publicKey, BigInt(micro), DECIMALS),
      memoIx(memo, auth.publicKey),
    ],
    [auth],
  );
}
