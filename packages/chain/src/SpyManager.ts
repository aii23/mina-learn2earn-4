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

export class SpyMessage extends Struct({
    agentId: Field,
    value: Provable.Array(Character, 12),
    securityCode: Provable.Array(Character, 2),
}) {
    getSecurityCodeHash(): Field {
        return Poseidon.hash(this.securityCode.map((char) => char.toField()));
    }
}

export class SpyStatus extends Struct({
    active: Bool,
    lastMessageId: Field,
    securityCodeHash: Field,
}) {}

@runtimeModule()
export class SpyManager extends RuntimeModule<void> {
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
