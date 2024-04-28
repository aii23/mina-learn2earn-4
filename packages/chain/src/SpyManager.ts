import {
  RuntimeModule,
  runtimeMethod,
  runtimeModule,
  state,
} from '@proto-kit/module';
import { State, StateMap, assert } from '@proto-kit/protocol';
import {
  Bool,
  Character,
  CircuitString,
  Experimental,
  Field,
  Poseidon,
  Provable,
  PublicKey,
  Struct,
  UInt64,
} from 'o1js';

function getRandomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

const stringValues = '01234567890abcdefghijklmnopqrstuvwxyz';

export class SpyMessage extends Struct({
  agentId: Field,
  value: Provable.Array(Character, 12),
  securityCode: Provable.Array(Character, 2),
}) {
  getSecurityCodeHash(): Field {
    return Poseidon.hash(this.securityCode.map((char) => char.toField()));
  }

  static random(agentId: Field, securityCode: Character[]): SpyMessage {
    return new SpyMessage({
      agentId,
      value: [...Array(12)].map((index) => {
        let val = stringValues[getRandomInt(stringValues.length)];
        return Character.fromString(
          stringValues[getRandomInt(stringValues.length)]
        );
      }),
      securityCode: securityCode,
    });
  }
}

export class SpyStatus extends Struct({
  active: Bool,
  lastMessageId: Field,
  securityCodeHash: Field,
}) {}

export class AditionalSpyInfo extends Struct({
  blockHeigh: UInt64,
  sender: PublicKey,
  nonce: UInt64,
}) {}

export class SpyMessageProofPublicInput extends Struct({
  securityCodeHash: Field,
}) {}

export class SpyMessageProofPublicOputput extends Struct({}) {}

export const proveMessage = (
  publicInput: SpyMessageProofPublicInput,
  message: SpyMessage
): SpyMessageProofPublicOputput => {
  assert(publicInput.securityCodeHash.equals(message.getSecurityCodeHash()));
  // // Value is 12 length by default

  return new SpyMessageProofPublicOputput({});
};

export const MessageApp = Experimental.ZkProgram({
  publicInput: SpyMessageProofPublicInput,
  publicOutput: SpyMessageProofPublicOputput,
  methods: {
    proveMessage: {
      privateInputs: [SpyMessage],
      method: proveMessage,
    },
  },
});

export class MessageProof extends Experimental.ZkProgram.Proof(MessageApp) {}

interface SpyManagerConfig {}

@runtimeModule()
export class SpyManager extends RuntimeModule<SpyManagerConfig> {
  @state() public spyStatuses = StateMap.from<Field, SpyStatus>(
    Field,
    SpyStatus
  );

  @runtimeMethod()
  public addSpy(id: Field, securityCodeHash: Field) {
    assert(
      this.spyStatuses.get(id).value.active.not(),
      'Spy with such id already exist'
    );

    this.spyStatuses.set(
      id,
      new SpyStatus({
        active: Bool(true),
        lastMessageId: Field.from(0),
        securityCodeHash,
      })
    );
  }

  @runtimeMethod()
  public sendMessage(
    agentId: Field,
    messageId: Field,
    messageProof: MessageProof
  ) {
    let spyStatus = this.spyStatuses.get(agentId).value;

    messageProof.verify();

    assert(
      messageProof.publicInput.securityCodeHash.equals(
        spyStatus.securityCodeHash
      )
    );

    assert(spyStatus.active, 'This agent is not active');
    assert(messageId.greaterThan(spyStatus.lastMessageId), 'Old message');

    spyStatus.lastMessageId = messageId;
    this.spyStatuses.set(agentId, spyStatus);
  }
}

@runtimeModule()
export class SpyManagerExtended extends SpyManager {
  @state() public additionalInfo = StateMap.from<Field, AditionalSpyInfo>(
    Field,
    AditionalSpyInfo
  );

  @runtimeMethod()
  public override sendMessage(
    agentId: Field,
    messageId: Field,
    messageProof: MessageProof
  ) {
    super.sendMessage(agentId, messageId, messageProof);

    let addInfo = this.additionalInfo.get(agentId).value;

    addInfo.blockHeigh = this.network.block.height;
    addInfo.nonce = addInfo.nonce.add(1);
    addInfo.sender = this.transaction.sender.value;

    this.additionalInfo.set(agentId, addInfo);
  }
}
