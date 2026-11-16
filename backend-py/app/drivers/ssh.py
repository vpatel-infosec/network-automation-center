from netmiko import ConnectHandler

class NetworkDriver:
    def __init__(self, device_data, credential):
        self.device = {
            'device_type': self._map_driver(device_data.driver),
            'host': device_data.host,
            'username': credential.username,
            'password': credential.password,
            'port': device_data.port,
            'secret': credential.enable_password or '',
        }

    def _map_driver(self, driver_name):
        # Simplified mapping
        mapping = {
            'cisco_ios': 'cisco_ios',
            'cisco_nxos': 'cisco_nxos',
            'juniper': 'juniper_junos',
        }
        return mapping.get(driver_name, 'autodetect')

    def run_command(self, command):
        with ConnectHandler(**self.device) as net_connect:
            return net_connect.send_command(command)
