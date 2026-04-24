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
        
        let commandCharacteristic = null;
        if (profile.uuids.command) {
            try {
                commandCharacteristic = await service.getCharacteristic(profile.uuids.command);
            } catch (e) {
                log(`Command characteristic not found: ${e.message}`, 'warn');
            }
        }

        if (profile.uuids.response) {
            try {
                responseCharacteristic = await service.getCharacteristic(profile.uuids.response);
                await responseCharacteristic.startNotifications();
                responseCharacteristic.addEventListener('characteristicvaluechanged', handleNotification);
            } catch (e) {
                log(`Response characteristic not found: ${e.message}`, 'warn');
            }
        }

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

    async function dumpDeviceInfo(device) {
        if (!device?.gatt?.connected) return null;
        
        const dump = {
            deviceName: device.name,
            id: device.id,
            services: []
        };

        const services = await device.gatt.getPrimaryServices();
        for (const service of services) {
            const serviceData = {
                uuid: service.uuid,
                characteristics: []
            };

            const characteristics = await service.getCharacteristics();
            for (const char of characteristics) {
                const charData = {
                    uuid: char.uuid,
                    properties: {
                        read: char.properties.read,
                        write: char.properties.write,
                        writeWithoutResponse: char.properties.writeWithoutResponse,
                        notify: char.properties.notify,
                        indicate: char.properties.indicate
                    }
                };

                if (char.properties.read) {
                    try {
                        const value = await char.readValue();
                        charData.valueHex = Array.from(new Uint8Array(value.buffer))
                            .map((b) => b.toString(16).padStart(2, '0'))
                            .join(' ');
                    } catch (e) {
                        charData.readError = e.message;
                    }
                }

                serviceData.characteristics.push(charData);
            }
            dump.services.push(serviceData);
        }

        return dump;
    }

    return {
        requestDevice,
        connect,
        disconnect,
        write,
        dumpDeviceInfo
    };
}
