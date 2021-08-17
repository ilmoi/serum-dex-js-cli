// import BN from 'bn.js';
// import {
//   Connection,
//   PublicKey,
//   Keypair,
//   Account,
//   Transaction,
//   SystemProgram,
//   sendAndConfirmTransaction,
//   TransactionInstruction,
//   Signer,
// } from '@solana/web3.js';
// import {
//   Token,
//   TOKEN_PROGRAM_ID,
// } from '@solana/spl-token';
//
// import { PoolInstructions, PoolTransactions } from '@project-serum/pool';
// import {
//   createAssociatedTokenAccount,
//   getAssociatedTokenAddress,
// } from '@project-serum/associated-token';
// import { LQD_FEE_OWNER_ADDRESS } from '@project-serum/pool/dist/lib/instructions';
// import { TokenInstructions } from '@project-serum/token';
//
//
// // ============================================================================= constants
//
// const connection = new Connection('http://localhost:8899', 'recent');
// const POOL_PROGRAM_ID = new PublicKey('Gn6vp3tvRBPntaX4dgtqqegt6S1a8R9vacge5mBQu9dV');
//
// const pk = Uint8Array.from([208, 175, 150, 242, 88, 34, 108, 88, 177, 16, 168, 75, 115, 181, 199, 242, 120, 4, 78, 75, 19, 227, 13, 215, 184, 108, 226, 53, 111, 149, 179, 84, 137, 121, 79, 1, 160, 223, 124, 241, 202, 203, 220, 237, 50, 242, 57, 158, 226, 207, 203, 188, 43, 28, 70, 110, 214, 234, 251, 15, 249, 157, 62, 80]);
// const user = new Account(pk);
// // const payerWallet = new NodeWallet(payerAcc);
// // const provider = new Provider(connection, payerWallet, {});
//
// // ============================================================================= functions
//
// async function getPoolInfo() {
//   // let poolInfo = await loadPoolInfo(connection, poolAddress);
//   // console.log(poolInfo.state);
//
// }
//
// async function initPool() {
//   // --------------------------------------- prepare mints & accs
//   const mint1: Token = await createMintAccount(connection, user);
//   const mint2: Token = await createMintAccount(connection, user);
//   const assetMints: PublicKey[] = [mint1.publicKey, mint2.publicKey];
//
//   const poolMint: Token = await createMintAccount(connection, user);
//
//   const userVault1: PublicKey = await createAndFundUserAccount(mint1, 1000, user);
//   const userVault2: PublicKey = await createAndFundUserAccount(mint2, 1000, user);
//   const userVaults = [userVault1, userVault2];
//
//   const initialAssetQuantities = [new BN(100), new BN(400)];
//
//   // --------------------------------------- prepare PDAs
//   const poolStateAccount = new Account();
//
//   //vault signer derived from pool state and owned by the pool program
//   const [vaultSigner, vaultSignerNonce] = await PublicKey.findProgramAddress(
//     [poolStateAccount.publicKey.toBuffer()],
//     POOL_PROGRAM_ID,
//   );
//
//   //asset vaults derived from vaultsigner + mint, will be created inside the program
//   const vaultAddresses = await Promise.all(
//     assetMints.map(mint => getAssociatedTokenAddress(vaultSigner, mint)),
//   );
//
//   //initializer fee acc derived from user + poolmint, will be created inside the program
//   const initializerFeeAcc = await getAssociatedTokenAddress(
//     user.publicKey,
//     poolMint.publicKey,
//   );
//
//   //liquidity fee address derived from owner + poolmint, will be created inside the program
//   const lqdFeeAddress = await getAssociatedTokenAddress(
//     LQD_FEE_OWNER_ADDRESS,
//     poolMint.publicKey,
//   );
//
//   // --------------------------------------- prepare the two ix
//
//   const setup = {
//     transaction: new Transaction(),
//     signers: [poolMint.payer],
//   };
//   const finalize = {
//     transaction: new Transaction(),
//     signers: [poolStateAccount],
//   };
//
//   // Initialize pool token.
//   setup.transaction.add(
//     await createAssociatedTokenAccount(
//       user.publicKey,
//       user.publicKey,
//       poolMint.publicKey,
//     ),
//     await createAssociatedTokenAccount(
//       user.publicKey,
//       LQD_FEE_OWNER_ADDRESS,
//       poolMint.publicKey,
//     ),
//   );
//
//   finalize.transaction.add(
//     TokenInstructions.mintTo({
//       mint: poolMint.publicKey,
//       destination: initializerFeeAcc,
//       amount: new BN(1),
//       mintAuthority: user.publicKey,
//     }),
//     TokenInstructions.setAuthority({
//       target: poolMint.publicKey,
//       currentAuthority: user.publicKey,
//       newAuthority: vaultSigner,
//       authorityType: 0, // AuthorityType::MintTokens
//     }),
//   );
//
//   // Initialize vault accounts.
//   await Promise.all(
//     assetMints.map(async (mint, index) => {
//       const vault = vaultAddresses[index];
//       setup.transaction.add(
//         await createAssociatedTokenAccount(user.publicKey, vaultSigner, mint),
//       );
//       finalize.transaction.add(
//         TokenInstructions.transfer({
//           source: userVaults[index],
//           destination: vault,
//           amount: initialAssetQuantities[index],
//           owner: user.publicKey,
//         }),
//       );
//     }),
//   );
//
//   // Initialize pool account.
//   finalize.transaction.add(
//     await generateCreateSystemAccountIx(
//       connection,
//       user.publicKey,
//       poolStateAccount.publicKey,
//       POOL_PROGRAM_ID,
//       1000, //stole from their "crecte-pool-etc..." doc
//     ),
//     PoolInstructions.initialize(
//       POOL_PROGRAM_ID,
//       poolStateAccount.publicKey,
//       poolMint.publicKey,
//       'zepool',
//       vaultAddresses,
//       vaultSigner,
//       vaultSignerNonce,
//       lqdFeeAddress,
//       initializerFeeAcc,
//       2500,
//     ),
//   );
//
//   await sendAndConfirmTransaction(connection, setup.transaction, setup.signers);
//
//
//   // const [poolAddress, transactions] = await PoolTransactions.initializeSimplePool({
//   //   connection,
//   //   assetMints: [mint1.publicKey, mint2.publicKey],
//   //   creator: payerAcc.publicKey,
//   //   creatorAssets: [vault1, vault2],
//   //   initialAssetQuantities: [new BN(100), new BN(400)],
//   //   poolStateSpace: 1000,
//   //   programId: POOL_PROGRAM_ID,
//   //   poolName: 'yaypool',
//   //   feeRate: 2500,
//   // });
//   // console.log('Pool address:', poolAddress.toBase58());
//   // for (const { transaction, signers } of transactions) {
//   //   await sendAndConfirmTransaction(connection, transaction, [
//   //     user,
//   //     ...signers,
//   //   ]);
//   // }
//
// }
//
// async function play() {
//   console.log('playing');
//   await initPool();
//
// }
//
// play();
//
//
// // ============================================================================= helpers
//
// async function createMintAccount(connection: Connection, payerKp: Account): Promise<Token> {
//   return Token.createMint(
//     connection,
//     payerKp,
//     payerKp.publicKey,
//     null,
//     0,
//     TOKEN_PROGRAM_ID,
//   );
// }
//
// async function createAndFundUserAccount(mint: Token, mintAmount: number, ownerKp: Account): Promise<PublicKey> {
//   const tokenUserPk = await mint.createAccount(ownerKp.publicKey);
//   await mint.mintTo(tokenUserPk, ownerKp.publicKey, [], mintAmount);
//   return tokenUserPk;
// }
//
// async function generateCreateSystemAccountIx(
//   connection: Connection,
//   payerPk: PublicKey,
//   destPk: PublicKey,
//   ownerPk: PublicKey,
//   space: number,
// ) {
//   return SystemProgram.createAccount({
//     fromPubkey: payerPk,
//     newAccountPubkey: destPk,
//     lamports: await connection.getMinimumBalanceForRentExemption(space),
//     space,
//     programId: ownerPk,
//   });
// }
//
// async function prepareAndSendTx(connection: Connection, instructions: TransactionInstruction[], signers: Signer[]) {
//   const tx = new Transaction().add(...instructions);
//   const sig = await sendAndConfirmTransaction(connection, tx, signers);
//   console.log(sig);
// }
//
// async function newAccountWithLamports(
//   connection: Connection,
//   lamports: number = 1000000,
// ): Promise<Account> {
//   const account = new Account();
//
//   let retries = 30;
//   // console.log("new account is ", account);
//   await connection.requestAirdrop(account.publicKey, lamports);
//   for (; ;) {
//     // console.log('round', retries)
//     await sleep(500);
//     if (lamports == (await connection.getBalance(account.publicKey))) {
//       return account;
//     }
//     if (--retries <= 0) {
//       break;
//     }
//   }
//   throw new Error(`Airdrop of ${lamports} failed`);
// }
//
// export function sleep(ms: number): Promise<void> {
//   return new Promise(resolve => setTimeout(resolve, ms));
// }
