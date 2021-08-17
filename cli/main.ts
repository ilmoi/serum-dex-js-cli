import BN from 'bn.js';
import {
  Connection,
  Keypair, LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction, Signer,
  SystemProgram,
  Transaction, TransactionInstruction,
} from '@solana/web3.js';
import {
  AccountLayout,
  MintLayout,
  Token,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { DexInstructions, Market } from '@project-serum/serum';
import { SRM_MINT } from '@project-serum/serum/lib/token-instructions';

// ============================================================================= bc class

export class Blockchain {
  connection: Connection;
  DEX_PROGRAM_ID = new PublicKey('32X9WvCHTtab6QUujy3edG1ogdAWUKrJ3VXApZjNq7dD');

  ownerKp: Keypair = Keypair.fromSecretKey(Uint8Array.from([208, 175, 150, 242, 88, 34, 108, 88, 177, 16, 168, 75, 115, 181, 199, 242, 120, 4, 78, 75, 19, 227, 13, 215, 184, 108, 226, 53, 111, 149, 179, 84, 137, 121, 79, 1, 160, 223, 124, 241, 202, 203, 220, 237, 50, 242, 57, 158, 226, 207, 203, 188, 43, 28, 70, 110, 214, 234, 251, 15, 249, 157, 62, 80]));

  marketKp = new Keypair();
  reqQKp = new Keypair();
  eventQKp = new Keypair();
  bidsKp = new Keypair();
  asksKp = new Keypair();

  //mints
  coinMint: Token;
  pcMint: Token;
  srmMint: Token;
  msrmMint: Token;

  //the protocol
  coinVaultPk: PublicKey;
  pcVaultPk: PublicKey;

  //user 1
  coinUserPk: PublicKey;
  pcUserPk: PublicKey;
  srmUserPk: PublicKey;
  msrmUserPk: PublicKey;

  //user 2
  coinUser2Pk: PublicKey;
  pcUser2Pk: PublicKey;
  srmUser2Pk: PublicKey;
  msrmUser2Pk: PublicKey;

  market: Market;

  // --------------------------------------- connection

  async getConnection() {
    const url = 'http://localhost:8899';
    this.connection = new Connection(url, 'recent');
    const version = await this.connection.getVersion();
    console.log('connection to cluster established:', url, version);
  }

  // --------------------------------------- init market

  async initMarket() {
    this.coinMint = await this._createMintAccount();
    this.pcMint = await this._createMintAccount();
    this.srmMint = new Token(this.connection, new PublicKey('8JuQxz4ESxWHqGvyx2x7ppbX9pifLUqUg7Ye3jAPX9ga'), TOKEN_PROGRAM_ID, this.ownerKp as any);
    this.msrmMint = new Token(this.connection, new PublicKey('E4NjqsYo7SY3xV2CoR62db4VnWfnEUTBetCWA4qSFw1S'), TOKEN_PROGRAM_ID, this.ownerKp as any);
    console.log('srm mint is ', this.srmMint.publicKey.toBase58());

    //length taken from here - https://github.com/project-serum/serum-dex/blob/master/dex/crank/src/lib.rs#L1286
    //this holds market state, hence need to fit this data structure - https://github.com/project-serum/serum-dex/blob/master/dex/src/state.rs#L176
    const marketIx = await this._generateCreateStateAccIx(this.marketKp.publicKey, 376 + 12);
    //support few requests at a time, but many (1<<20) events
    const requestQueueIx = await this._generateCreateStateAccIx(this.reqQKp.publicKey, 640 + 12);
    const eventQueueIx = await this._generateCreateStateAccIx(this.eventQKp.publicKey, 1048576 + 12);
    //support 1<<16 bids and asks
    const bidsIx = await this._generateCreateStateAccIx(this.bidsKp.publicKey, 65536 + 12);
    const asksIx = await this._generateCreateStateAccIx(this.asksKp.publicKey, 65536 + 12);

    await this._prepareAndSendTx(
      [marketIx, requestQueueIx, eventQueueIx, bidsIx, asksIx],
      [this.ownerKp, this.marketKp, this.reqQKp, this.eventQKp, this.bidsKp, this.asksKp],
    );
    console.log('created necessary accounts');

    //create the vault signer PDA
    //seeds = [market.as_ref(), bytes_of(nonce)]
    const [vaultSignerPk, vaultSignerNonce] = await PublicKey.findProgramAddress(
      [this.marketKp.publicKey.toBuffer()],
      this.DEX_PROGRAM_ID,
    );

    // const seeds = [this.marketKp.publicKey.toBuffer(), Buffer.from([vaultSignerNonce, 0, 0, 0, 0, 0, 0, 0])];
    // const created_key = await PublicKey.createProgramAddress(
    //   seeds,
    //   this.DEX_PROGRAM_ID,
    // );
    // console.log('seeds are', seeds);
    // console.log('nonce is ', vaultSignerNonce);
    // console.log('acc is ', this.marketKp.publicKey.toBase58());
    // console.log('created vault signer PDA, at ', vaultSignerPk.toBase58());
    // console.log('created vault signer PDA, at ', vaultSignerPk.toBytes());
    // console.log('created vault signer PDA, at ', created_key.toBase58());
    // console.log('created vault signer PDA, at ', created_key.toBytes());

    //create token accounts
    this.coinVaultPk = await this._createTokenAccount(this.coinMint, vaultSignerPk);
    this.pcVaultPk = await this._createTokenAccount(this.pcMint, vaultSignerPk);

    this.coinUserPk = await this._createAndFundUserAccount(this.coinMint, 0);
    this.pcUserPk = await this._createAndFundUserAccount(this.pcMint, 5000);
    this.srmUserPk = await this._createTokenAccount(this.srmMint, this.ownerKp.publicKey);
    this.msrmUserPk = await this._createTokenAccount(this.msrmMint, this.ownerKp.publicKey);

    this.coinUser2Pk = await this._createAndFundUserAccount(this.coinMint, 1000);
    this.pcUser2Pk = await this._createAndFundUserAccount(this.pcMint, 0);
    this.srmUser2Pk = await this._createTokenAccount(this.srmMint, this.ownerKp.publicKey);
    this.msrmUser2Pk = await this._createTokenAccount(this.msrmMint, this.ownerKp.publicKey);

    const initMarketIx = DexInstructions.initializeMarket({
        //dex accounts
        market: this.marketKp.publicKey,
        requestQueue: this.reqQKp.publicKey,
        eventQueue: this.eventQKp.publicKey,
        bids: this.bidsKp.publicKey,
        asks: this.asksKp.publicKey,
        //vaults
        baseVault: this.coinVaultPk,
        quoteVault: this.pcVaultPk,
        //mints
        baseMint: this.coinMint.publicKey,
        quoteMint: this.pcMint.publicKey,
        //rest
        baseLotSize: new BN(1),
        quoteLotSize: new BN(1),
        feeRateBps: new BN(50),
        vaultSignerNonce: new BN(vaultSignerNonce),
        quoteDustThreshold: new BN(100),
        programId: this.DEX_PROGRAM_ID,
        // authority = undefined,
        // pruneAuthority = undefined,
      },
    );

    await this._prepareAndSendTx(
      [initMarketIx],
      [this.ownerKp],
    );
    console.log('successfully inited the market');
  }

  async loadMarket() {
    this.market = await Market.load(this.connection, this.marketKp.publicKey, {}, this.DEX_PROGRAM_ID);
    console.log('market loaded');
  }

  async placeBids() {
    await this.market.placeOrder(this.connection, {
        owner: this.ownerKp as any,
        payer: this.pcUserPk,
        side: 'buy',
        price: 120,
        size: 10,
        orderType: 'limit',
      },
    );
    await this.market.placeOrder(this.connection, {
        owner: this.ownerKp as any,
        payer: this.pcUserPk,
        side: 'buy',
        price: 110,
        size: 20,
        orderType: 'limit',
      },
    );
    console.log('placed bids');
  }

  async placeAsks() {
    await this.market.placeOrder(this.connection, {
        owner: this.ownerKp as any,
        payer: this.coinUser2Pk,
        side: 'sell',
        price: 119,
        size: 10,
        orderType: 'limit',
      },
    );
    await this.market.placeOrder(this.connection, {
        owner: this.ownerKp as any,
        payer: this.coinUser2Pk,
        side: 'sell',
        price: 130,
        size: 30,
        orderType: 'limit',
      },
    );
    console.log('placed asks');
  }

  //without this function tokens won't become free
  async consumeEvents() {
    const openOrders = await this.market.findOpenOrdersAccountsForOwner(
      this.connection,
      this.ownerKp.publicKey,
    );
    const consumeEventsIx = this.market.makeConsumeEventsInstruction(
      openOrders.map(oo => oo.publicKey), 100
    )
    await this._prepareAndSendTx(
      [consumeEventsIx],
      [this.ownerKp]
    )
    console.log('consumed events')
  }

  async settleFunds() {
    for (let openOrders of await this.market.findOpenOrdersAccountsForOwner(
      this.connection,
      this.ownerKp.publicKey,
    )) {
      console.log(openOrders)
      if (openOrders.baseTokenFree > new BN(0) || openOrders.quoteTokenFree > new BN(0)) {

        await this.market.settleFunds(
          this.connection,
          this.ownerKp as any,
          openOrders,
          // spl-token accounts to which to send the proceeds from trades
          //todo be careful here - coins go to user1 (buyer), pc go to user2 (Seller)
          // because the owner in this case is the same for the two it's a bit of a mess
          this.coinUserPk,
          this.pcUser2Pk,
        );
      }
    }
    console.log('settled funds');
  }

  async printMetrics() {
    console.log('// ---------------------------------------');
    let bids = await this.market.loadBids(this.connection);
    let asks = await this.market.loadAsks(this.connection);

    // bids
    console.log('bids are:');
    for (let [price, size] of bids.getL2(20)) {
      console.log(price, size);
    }

    // asks
    console.log('asks are:');
    for (let [price, size] of asks.getL2(20)) {
      console.log(price, size);
    }
    // for (let order of asks) {
    //   console.log(
    //     order.orderId,
    //     order.price,
    //     order.size,
    //     order.side, // 'buy' or 'sell'
    //   );
    // }

    // fills
    console.log('fills are:')
    for (let fill of await this.market.loadFills(this.connection)) {
      console.log(fill.orderId, fill.price, fill.size, fill.side);
    }

    //open orders are:
    // const orders = await this.market.loadOrdersForOwner(this.connection, this.ownerKp.publicKey);
    // console.log('open orders for the owner are', orders);

    //user token balances
    console.log('PROTOCOL:')
    console.log('  coin vault balance is', await this._getTokenBalance(this.coinVaultPk));
    console.log('  pc vault balance is', await this._getTokenBalance(this.pcVaultPk));
    console.log('USER 1:')
    console.log('  coin user balance is', await this._getTokenBalance(this.coinUserPk));
    console.log('  pc user balance is', await this._getTokenBalance(this.pcUserPk));
    console.log('USER 2:')
    console.log('  coin user 2 balance is', await this._getTokenBalance(this.coinUser2Pk));
    console.log('  pc user 2 balance is', await this._getTokenBalance(this.pcUser2Pk));
    console.log('// ---------------------------------------');
  }

  // --------------------------------------- helpers

  async _getTokenBalance(tokenAccPk: PublicKey) {
    const balance = await this.connection.getTokenAccountBalance(tokenAccPk);
    return balance.value.uiAmount;
  }

  async _prepareAndSendTx(instructions: TransactionInstruction[], signers: Signer[]) {
    const tx = new Transaction().add(...instructions);
    const sig = await sendAndConfirmTransaction(this.connection, tx, signers);
    console.log(sig);
  }

  async _createMintAccount(): Promise<Token> {
    return Token.createMint(
      this.connection,
      this.ownerKp as any,
      this.ownerKp.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID,
    );
  }

  async _createTokenAccount(mint: Token, owner: PublicKey): Promise<PublicKey> {
    return mint.createAccount(owner);
  }

  async _createAndFundUserAccount(mint: Token, mintAmount: number): Promise<PublicKey> {
    const tokenUserPk = await mint.createAccount(this.ownerKp.publicKey);
    await mint.mintTo(tokenUserPk, this.ownerKp.publicKey, [], mintAmount);
    return tokenUserPk;
  }

  async _generateCreateStateAccIx(newAccountPubkey: PublicKey, space: number): Promise<TransactionInstruction> {
    return SystemProgram.createAccount({
      programId: this.DEX_PROGRAM_ID,
      fromPubkey: this.ownerKp.publicKey,
      newAccountPubkey,
      space,
      lamports: await this.connection.getMinimumBalanceForRentExemption(space),
    });
  }
}

async function play() {
  const bc = new Blockchain();
  await bc.getConnection();
  await bc.initMarket();

  await bc.loadMarket();
  await bc.printMetrics();

  await bc.placeBids();
  await bc.printMetrics();

  await bc.placeAsks();
  await bc.printMetrics();

  await bc.consumeEvents();
  await bc.printMetrics();

  await bc.settleFunds();
  await bc.printMetrics();
}

play();
