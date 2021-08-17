/*
todo
  got this one working - need to remember to:
  1)replace POOL_PROGRAM_ID below
  2)replace RETBUF_PROGRAM_ID with an instance of https://spl.solana.com/shared-memory
  3)have the localnet running

  ignore the other file (iljas_try) - just keeping for history.
 */

import {
  Account,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TokenInstructions } from '@project-serum/token';
import { promisify } from 'util';
import { homedir } from 'os';
import { readFile } from 'fs';
import BN from 'bn.js';
import { PoolTransactions } from '../transactions';
import { getPoolBasket, loadPoolInfo, PoolInfo, UserInfo } from '../index';
import { getAssociatedTokenAddress } from '@project-serum/associated-token';

// ============================================================================= consts

const POOL_PROGRAM_ID = new PublicKey(
  'Gn6vp3tvRBPntaX4dgtqqegt6S1a8R9vacge5mBQu9dV',
);

// ============================================================================= do stuff

async function doStuff() {
  const connection = new Connection('http://localhost:8899', 'recent');
  const payer = new Account(
    Buffer.from(
      JSON.parse(
        await promisify(readFile)(homedir() + '/.config/solana/id.json', {
          encoding: 'utf-8',
        }),
      ),
    ),
  );

  //these are user's vaults, not protocol's vaults
  const [mint1, vault1] = await createMint(connection, payer);
  const [mint2, vault2] = await createMint(connection, payer);

  // --------------------------------------- init pool

  const [
    poolAddress,
    transactions,
  ] = await PoolTransactions.initializeSimplePool({
    connection,
    assetMints: [mint1, mint2],
    creator: payer.publicKey,
    creatorAssets: [vault1, vault2],
    initialAssetQuantities: [new BN(100), new BN(300)],
    poolStateSpace: 1000,
    programId: POOL_PROGRAM_ID,
    poolName: 'Test Pool',
    feeRate: 2500,
  });
  console.log('Pool address:', poolAddress.toBase58());
  for (const { transaction, signers } of transactions) {
    await sendAndConfirmTransaction(connection, transaction, [
      payer,
      ...signers,
    ]);
  }

  // --------------------------------------- get pool info

  const poolInfo = await loadPoolInfo(connection, poolAddress);
  console.log(poolInfo);

  // --------------------------------------- get

  //{ quantities: [ <BN: 1>, <BN: 1> ] } - min amount of tokens in each account - 1
  console.log(
    await getPoolBasket(
      connection,
      poolInfo,
      { create: new BN(1) },
      payer.publicKey,
    ),
  );
  //{ quantities: [ <BN: 0>, <BN: 0> ] } - except for redemption which rounds down - so 0 each
  console.log(
    await getPoolBasket(
      connection,
      poolInfo,
      { redeem: new BN(1) },
      payer.publicKey,
    ),
  );
  //{ quantities: [ <BN: 64>, <BN: 12c> ] } - 6 mint decimals means we're actually specifiying 1 pool token, which equates to 100 token A and 300 token B, like the above
  console.log(
    await getPoolBasket(
      connection,
      poolInfo,
      { create: new BN(1000000) },
      payer.publicKey,
    ),
  );
  //{ quantities: [ <BN: c8>, <BN: 258> ] } - 2 tokens - 200 and 600
  console.log(
    await getPoolBasket(
      connection,
      poolInfo,
      { create: new BN(2000000) },
      payer.publicKey,
    ),
  );
  // { quantities: [ <BN: c8>, <BN: 258> ] } - exactly same for redemption
  console.log(
    await getPoolBasket(
      connection,
      poolInfo,
      { redeem: new BN(2000000) },
      payer.publicKey,
    ),
  );

  // --------------------------------------- execute

  const userInfo: UserInfo = {
    owner: payer.publicKey,
    poolTokenAccount: await getAssociatedTokenAddress(
      payer.publicKey,
      poolInfo.state.poolTokenMint,
    ),
    assetAccounts: [vault1, vault2],
  };

  //execute a creation
  {
    const { transaction, signers } = PoolTransactions.execute(
      poolInfo,
      { create: new BN(1000000) },
      userInfo,
      {
        quantities: [new BN(100), new BN(300)],
      },
    );
    await sendAndConfirmTransaction(connection, transaction, [
      payer,
      ...signers,
    ]);
  }

  //read back
  //{ quantities: [ <BN: 64>, <BN: 12c> ] } - 100,300
  //amounts haven't changed because we haven't subtracted any fees yet - they've only been subtracted from the minted tokens to user
  console.log(
    await getPoolBasket(
      connection,
      poolInfo,
      { create: new BN(1000000) },
      payer.publicKey,
    ),
  );

  //exectue a redemption
  {
    const { transaction, signers } = PoolTransactions.execute(
      poolInfo,
      { redeem: new BN(2000000 - poolInfo.state.feeRate) },
      userInfo,
      {
        quantities: [new BN(200), new BN(600)],
      },
    );
    await sendAndConfirmTransaction(connection, transaction, [
      payer,
      ...signers,
    ]);
  }

  //read back
  //{ quantities: [ <BN: b6>, <BN: 16c> ] } - 182, 300
  //token A quantity went down because a part was subtracted for fees
  console.log(
    await getPoolBasket(
      connection,
      poolInfo,
      { create: new BN(1000000) },
      payer.publicKey,
    ),
  );
}

// ============================================================================= helpers

async function createMint(connection: Connection, payer: Account) {
  const mint = new Account();
  const vault = new Account();
  const txn = new Transaction();
  txn.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: 82,
      lamports: await connection.getMinimumBalanceForRentExemption(82),
      programId: TOKEN_PROGRAM_ID,
    }),
    TokenInstructions.initializeMint({
      mint: mint.publicKey,
      decimals: 0,
      mintAuthority: payer.publicKey,
    }),
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: vault.publicKey,
      space: 165,
      lamports: await connection.getMinimumBalanceForRentExemption(165),
      programId: TOKEN_PROGRAM_ID,
    }),
    TokenInstructions.initializeAccount({
      account: vault.publicKey,
      mint: mint.publicKey,
      owner: payer.publicKey,
    }),
    TokenInstructions.mintTo({
      mint: mint.publicKey,
      destination: vault.publicKey,
      amount: new BN(10000),
      mintAuthority: payer.publicKey,
    }),
  );
  await sendAndConfirmTransaction(connection, txn, [payer, mint, vault]);
  return [mint.publicKey, vault.publicKey];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function createUserAccounts(
  connection: Connection,
  payer: Account,
  pool: PoolInfo,
): Promise<UserInfo> {
  const poolTokenAccount = new Account();
  const assetAccounts: Account[] = [];
  const lamports = await connection.getMinimumBalanceForRentExemption(165);
  const txn = new Transaction();
  txn.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: poolTokenAccount.publicKey,
      space: 165,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    TokenInstructions.initializeAccount({
      account: poolTokenAccount.publicKey,
      mint: pool.state.poolTokenMint,
      owner: payer.publicKey,
    }),
  );
  pool.state.assets.forEach(({ mint }) => {
    const account = new Account();
    assetAccounts.push(account);
    txn.add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: account.publicKey,
        space: 165,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      TokenInstructions.initializeAccount({
        account: account.publicKey,
        mint,
        owner: payer.publicKey,
      }),
    );
  });
  txn.feePayer = payer.publicKey;
  await sendAndConfirmTransaction(connection, txn, [
    payer,
    poolTokenAccount,
    ...assetAccounts,
  ]);
  return {
    owner: payer.publicKey,
    poolTokenAccount: poolTokenAccount.publicKey,
    assetAccounts: assetAccounts.map(account => account.publicKey),
  };
}

async function sendAndConfirmTransaction(
  connection: Connection,
  transaction: Transaction,
  signers: Account[],
) {
  const txid = await connection.sendTransaction(transaction, signers, {
    preflightCommitment: 'recent',
  });
  await connection.confirmTransaction(txid, 'recent');
  return txid;
}

doStuff().catch(e => console.error(e));
