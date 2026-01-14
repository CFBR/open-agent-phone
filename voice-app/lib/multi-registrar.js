/**
 * Multi-Extension SIP Registrar
 * Registers multiple extensions with 3CX independently
 */

class MultiRegistrar {
  constructor(srf, baseConfig) {
    this.srf = srf;
    this.baseConfig = baseConfig;
    this.registrations = new Map();
  }

  /**
   * Register all devices from config object
   * @param {Object} devices - Object keyed by extension with device configs
   */
  registerAll(devices) {
    const extensions = Object.keys(devices);
    console.log('[MULTI-REGISTRAR] Starting registration for ' + extensions.length + ' devices');
    
    for (const [extension, device] of Object.entries(devices)) {
      this.registerDevice(device);
    }
  }

  /**
   * Register a single device
   */
  registerDevice(device) {
    const config = {
      extension: device.extension,
      auth_id: device.authId,
      password: device.password,
      domain: this.baseConfig.domain,
      registrar: this.baseConfig.registrar,
      registrar_port: this.baseConfig.registrar_port,
      expiry: this.baseConfig.expiry,
      local_address: this.baseConfig.local_address,
      local_port: this.baseConfig.local_port
    };

    console.log('[MULTI-REGISTRAR] Registering ' + device.name + ' (ext ' + device.extension + ')');
    this.sendRegister(device, config);
  }

  /**
   * Send REGISTER request for a device
   */
  sendRegister(device, config) {
    const self = this;
    const uri = 'sip:' + config.registrar + ':' + config.registrar_port + ';transport=udp';
    // Include local_port in Contact so INVITEs come to the right port (5070 when SBC is on 5060)
    const localPort = config.local_port || 5060;
    const contact = 'sip:' + config.extension + '@' + config.local_address + ':' + localPort;

    console.log('[MULTI-REGISTRAR] REGISTER ' + device.name + ' to ' + uri);
    console.log('[MULTI-REGISTRAR]   Contact: ' + contact);

    this.srf.request(uri, {
      method: 'REGISTER',
      headers: {
        'From': '<sip:' + config.extension + '@' + config.domain + '>',
        'To': '<sip:' + config.extension + '@' + config.domain + '>',
        'Contact': '<' + contact + '>;expires=' + config.expiry,
        'Expires': config.expiry,
        'User-Agent': 'NetworkChuck-VoiceServer/1.0'
      },
      auth: {
        username: config.auth_id,
        password: config.password
      }
    }, function(err, req) {
      if (err) {
        console.error('[MULTI-REGISTRAR] ' + device.name + ' request error: ' + err.message);
        self.scheduleRetry(device, config, 60);
        return;
      }

      req.on('response', function(res) {
        if (res.status === 200) {
          console.log('[MULTI-REGISTRAR] ' + device.name + ' SUCCESS - Registered as ext ' + config.extension);
          
          var expiry = config.expiry;
          var contactHeader = res.get('Contact');
          if (contactHeader) {
            var match = contactHeader.match(/expires=(\d+)/i);
            if (match) expiry = parseInt(match[1], 10);
          }
          
          self.registrations.set(config.extension, {
            device: device,
            config: config,
            expiry: expiry,
            registeredAt: Date.now()
          });
          
          var refreshTime = Math.floor(expiry * 0.9);
          console.log('[MULTI-REGISTRAR] ' + device.name + ' refresh in ' + refreshTime + 's');
          self.scheduleRefresh(device, config, refreshTime);
          
        } else if (res.status === 401 || res.status === 407) {
          console.log('[MULTI-REGISTRAR] ' + device.name + ' auth challenge - handled by drachtio');
        } else {
          console.error('[MULTI-REGISTRAR] ' + device.name + ' FAILED: ' + res.status + ' ' + res.reason);
          self.scheduleRetry(device, config, 60);
        }
      });
    });
  }

  scheduleRefresh(device, config, seconds) {
    const self = this;
    setTimeout(function() {
      console.log('[MULTI-REGISTRAR] Refreshing ' + device.name);
      self.sendRegister(device, config);
    }, seconds * 1000);
  }

  scheduleRetry(device, config, seconds) {
    const self = this;
    console.log('[MULTI-REGISTRAR] ' + device.name + ' retry in ' + seconds + 's');
    setTimeout(function() {
      self.sendRegister(device, config);
    }, seconds * 1000);
  }

  stop() {
    this.registrations.clear();
    console.log('[MULTI-REGISTRAR] Stopped all registrations');
  }
}

module.exports = MultiRegistrar;
