export function createBluetoothClient({ log, onDisconnected, onNotification }) {
    let responseCharacteristic = null;
    let disconnectDevice = null;

    async function requestDevice(filters, optionalServices = []) {
        return navigator.bluetooth.requestDevice({ filters, optionalServices });
    }

    async function connect(device, profile) {
        disconnectDevice = device;
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(profile.uuids.service);
        const commandCharacteristic = await service.getCharacteristic(profile.uuids.command);
        responseCharacteristic = await service.getCharacteristic(profile.uuids.response);
        await responseCharacteristic.startNotifications();
        responseCharacteristic.addEventListener('characteristicvaluechanged', handleNotification);
        device.addEventListener('gattserverdisconnected', handleDisconnect);

        return {
            device,
            server,
            commandCharacteristic
        };
    }

    function handleNotification(event) {
        onNotification(new Uint8Array(event.target.value.buffer));
    }

    function handleDisconnect() {
        log('Bluetooth device disconnected', 'info');
        if (responseCharacteristic) {
            responseCharacteristic.removeEventListener('characteristicvaluechanged', handleNotification);
            responseCharacteristic = null;
        }
        disconnectDevice = null;
        onDisconnected();
    }

    async function write(commandCharacteristic, payload) {
        await commandCharacteristic.writeValueWithoutResponse(payload);
    }

    async function disconnect(connection) {
        const device = connection?.device || disconnectDevice;
        if (!device?.gatt?.connected) return;
        device.gatt.disconnect();
    }

    return {
        requestDevice,
        connect,
        disconnect,
        write
    };
}
