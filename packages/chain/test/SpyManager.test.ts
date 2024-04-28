import { TestingAppChain } from '@proto-kit/sdk';
import { Character, Field, Poseidon, PrivateKey, UInt64 } from 'o1js';
import { log } from '@proto-kit/common';
import {
  MessageProof,
  SpyManager,
  SpyManagerExtended,
  SpyMessage,
  SpyMessageProofPublicInput,
  proveMessage,
} from '../src/SpyManager';
import { TransactionExecutionResult } from '@proto-kit/sequencer';
import { Pickles } from 'o1js/dist/node/snarky';
import { dummyBase64Proof } from 'o1js/dist/node/lib/proof_system';

log.setLevel('ERROR');

export async function mockProof<I, O, P>(
  publicOutput: O,
  ProofType: new ({
    proof,
    publicInput,
    publicOutput,
    maxProofsVerified,
  }: {
    proof: unknown;
    publicInput: I;
    publicOutput: any;
    maxProofsVerified: 0 | 2 | 1;
  }) => P,
  publicInput: I
): Promise<P> {
  const [, proof] = Pickles.proofOfBase64(await dummyBase64Proof(), 2);
  return new ProofType({
    proof: proof,
    maxProofsVerified: 2,
    publicInput,
    publicOutput,
  });
}

describe('Spy Manager', () => {
  it('Check that spy manager works fine', async () => {
    const appChain = TestingAppChain.fromRuntime({
      SpyManagerExtended,
    });

    appChain.configurePartial({
      Runtime: {
        SpyManagerExtended: {},
        Balances: {},
      },
    });

    await appChain.start();
    const spyManager = appChain.runtime.resolve('SpyManagerExtended');

    const sendMessage = async (
      senderSK: PrivateKey,
      messageId: Field,
      message: SpyMessage
    ): Promise<TransactionExecutionResult> => {
      const sender = senderSK.toPublicKey();

      const publicInput = new SpyMessageProofPublicInput({
        securityCodeHash: message.getSecurityCodeHash(),
      });

      const publicOutput = proveMessage(publicInput, message);
      const proof = await mockProof(publicOutput, MessageProof, publicInput);

      appChain.setSigner(senderSK);
      let tx = await appChain.transaction(sender, () => {
        spyManager.sendMessage(message.agentId, messageId, proof);
      });

      await tx.sign();
      await tx.send();
      return (await appChain.produceBlock())!.transactions[0];
    };

    const spy1Id = Field.from(1);
    const spy1PrivateKey = PrivateKey.random();
    const spy1 = spy1PrivateKey.toPublicKey();
    const spy1SC = [Character.fromString('1'), Character.fromString('2')];
    const spy1SCHash = Poseidon.hash(spy1SC.map((val) => val.toField()));

    const spy2Id = Field.from(2);
    const spy2PrivateKey = PrivateKey.random();
    const spy2 = spy1PrivateKey.toPublicKey();
    const spy2SC = [Character.fromString('a'), Character.fromString('b')];
    const spy2SCHash = Poseidon.hash(spy2SC.map((val) => val.toField()));

    const noSpy2Id = Field.from(3);
    const noSpyPrivateKey = PrivateKey.random();
    const noSpy = spy1PrivateKey.toPublicKey();
    const noSpySC = [Character.fromString('b'), Character.fromString('3')];
    const noSpySCHash = Poseidon.hash(noSpySC.map((val) => val.toField()));

    // Register spy
    appChain.setSigner(spy1PrivateKey);
    let tx = await appChain.transaction(spy1, () => {
      spyManager.addSpy(spy1Id, spy1SCHash);
    });

    await tx.sign();
    await tx.send();
    await appChain.produceBlock();

    tx = await appChain.transaction(spy1, () => {
      spyManager.addSpy(spy2Id, spy2SCHash);
    });

    await tx.sign();
    await tx.send();
    await appChain.produceBlock();

    // Send right message
    const right1 = SpyMessage.random(spy1Id, spy1SC);
    let res = await sendMessage(spy1PrivateKey, Field(1), right1);
    expect(res.status.toBoolean()).toBeTruthy();

    // Send wrong messageId
    res = await sendMessage(spy1PrivateKey, Field(1), right1);
    expect(res.status.toBoolean()).toBeFalsy();

    // Send wrong security code
    const wrong1 = SpyMessage.random(spy1Id, spy2SC);
    res = await sendMessage(spy1PrivateKey, Field(1), wrong1);
    expect(res.status.toBoolean()).toBeFalsy();

    // Send noSpy message
    const wrong2 = SpyMessage.random(noSpy2Id, noSpySC);
    res = await sendMessage(noSpyPrivateKey, Field(1), wrong2);
    expect(res.status.toBoolean()).toBeFalsy();

    // Send right transaction from spy2
    const right2 = SpyMessage.random(spy2Id, spy2SC);
    res = await sendMessage(spy2PrivateKey, Field(1), right2);
    expect(res.status.toBoolean()).toBeTruthy();

    const spyStatus1 =
      await appChain.query.runtime.SpyManagerExtended.spyStatuses.get(spy1Id);
    const spyStatus2 =
      await appChain.query.runtime.SpyManagerExtended.spyStatuses.get(spy2Id);

    expect(spyStatus1?.lastMessageId.equals(Field.from(1))).toBeTruthy();
    expect(spyStatus2?.lastMessageId.equals(Field.from(1))).toBeTruthy();

    const spy1AdditionalInfo =
      await appChain.query.runtime.SpyManagerExtended.additionalInfo.get(
        spy1Id
      );

    console.log(spy1AdditionalInfo?.blockHeigh.toString());
    console.log(spy1AdditionalInfo?.nonce.toString());
    console.log(spy1AdditionalInfo?.sender.toString());
  }, 1_000_000);
});
