import {
    RuntimeModule,
    runtimeMethod,
    runtimeModule,
    state,
} from '@proto-kit/module';
import { StateMap, assert } from '@proto-kit/protocol';
import {
    Bool,
    Character,
    CircuitString,
    Field,
    Poseidon,
    Provable,
    Struct,
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
    public sendMessage(messageId: Field, message: SpyMessage) {
        let spyStatus = this.spyStatuses.get(message.agentId).value;

        assert(spyStatus.active, 'This agent is not active');
        assert(
            spyStatus.securityCodeHash.equals(message.getSecurityCodeHash()),
            'Wrong security code'
        );
        // Value is 12 length by default
        assert(messageId.greaterThan(spyStatus.lastMessageId), 'Old message');

        spyStatus.lastMessageId = messageId;
        this.spyStatuses.set(message.agentId, spyStatus);
    }
}
