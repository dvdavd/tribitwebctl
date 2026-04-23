export function buildPacket(deviceType, command, payload = []) {
    const length = 10 + payload.length;
    const base = [
        0x08,
        0xEE,
        0x00,
        0x00,
        0x00,
        deviceType,
        command,
        length & 0xFF,
        (length >> 8) & 0xFF,
        ...payload
    ];
    const checksum = base.reduce((total, value) => (total + value) & 0xFF, 0);
    return new Uint8Array([...base, checksum]);
}

export function parseNotificationPacket(value) {
    const data = value instanceof Uint8Array ? value : new Uint8Array(value.buffer);
    if (data.length < 10) return null;
    return {
        command: data[6],
        payload: data.slice(9, -1)
    };
}
