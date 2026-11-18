import Combine
import Foundation
import HomeKit
import WebKit

/// Owns HomeKit for the web page: lists lights, plugs, switches and
/// thermostats, writes values, and pushes accessory changes back to the page.
/// The page side is BridgeScript.swift / webapp/src/lib/native-home.ts.
final class HomeKitBridge: NSObject, ObservableObject {
    private let manager = HMHomeManager()
    private weak var webView: WKWebView?
    private var ready = false

    /// The characteristics worth listening to.
    private let watched: Set<String> = [
        HMCharacteristicTypePowerState,
        HMCharacteristicTypeBrightness,
        HMCharacteristicTypeCurrentTemperature,
        HMCharacteristicTypeTargetTemperature,
        HMCharacteristicTypeTargetHeatingCooling,
    ]

    override init() {
        super.init()
        manager.delegate = self
    }

    func attach(webView: WKWebView) {
        self.webView = webView
    }

    // MARK: - Requests from the page

    func handle(_ body: [String: Any]) {
        guard let id = body["id"] as? String, let action = body["action"] as? String else { return }
        let params = body["params"] as? [String: Any] ?? [:]
        switch action {
        case "status":
            reply(id, result: [
                "ready": ready,
                "authorized": manager.authorizationStatus.contains(.authorized),
                "homes": manager.homes.count,
            ])
        case "snapshot":
            reply(id, result: ["devices": allDevices()])
            // Values can be stale or missing until read: ask, and each answer
            // reaches the page as a "device" event.
            refreshValues()
        case "set":
            write(params) { [weak self] message in
                if let message = message {
                    self?.reply(id, error: message)
                } else {
                    self?.reply(id, result: [:])
                }
            }
        default:
            reply(id, error: "unknown action: \(action)")
        }
    }

    // MARK: - Devices

    private func deviceKind(of service: HMService) -> String? {
        switch service.serviceType {
        case HMServiceTypeLightbulb: return "light"
        case HMServiceTypeOutlet: return "outlet"
        case HMServiceTypeSwitch: return "switch"
        case HMServiceTypeThermostat: return "thermostat"
        default: return nil
        }
    }

    private func findCharacteristic(_ service: HMService, _ type: String) -> HMCharacteristic? {
        return service.characteristics.first { $0.characteristicType == type }
    }

    private func findNumber(_ service: HMService, _ type: String) -> NSNumber? {
        return findCharacteristic(service, type)?.value as? NSNumber
    }

    private func home(of accessory: HMAccessory) -> HMHome? {
        return manager.homes.first { $0.accessories.contains(accessory) }
    }

    private func displayName(_ service: HMService, _ accessory: HMAccessory) -> String {
        let name = service.name.trimmingCharacters(in: .whitespaces)
        return name.isEmpty ? accessory.name : name
    }

    private func describe(_ service: HMService, of accessory: HMAccessory, in home: HMHome) -> [String: Any]? {
        guard let kind = deviceKind(of: service) else { return nil }
        var device: [String: Any] = [
            "id": service.uniqueIdentifier.uuidString,
            "name": displayName(service, accessory),
            "room": accessory.room?.name ?? "",
            "home": home.name,
            "kind": kind,
            "reachable": accessory.isReachable,
        ]
        if kind == "thermostat" {
            if let value = findNumber(service, HMCharacteristicTypeCurrentTemperature) {
                device["currentTemp"] = value.doubleValue
            }
            if let target = findCharacteristic(service, HMCharacteristicTypeTargetTemperature) {
                if let value = target.value as? NSNumber { device["targetTemp"] = value.doubleValue }
                if let low = target.metadata?.minimumValue { device["minTemp"] = low.doubleValue }
                if let high = target.metadata?.maximumValue { device["maxTemp"] = high.doubleValue }
            }
            if let value = findNumber(service, HMCharacteristicTypeTargetHeatingCooling) {
                device["mode"] = value.intValue
            }
        } else {
            if let value = findNumber(service, HMCharacteristicTypePowerState) {
                device["on"] = value.boolValue
            }
            if kind == "light", let value = findNumber(service, HMCharacteristicTypeBrightness) {
                device["brightness"] = value.intValue
            }
        }
        return device
    }

    private func allDevices() -> [[String: Any]] {
        var devices: [[String: Any]] = []
        for home in manager.homes {
            for accessory in home.accessories {
                for service in accessory.services {
                    if let device = describe(service, of: accessory, in: home) {
                        devices.append(device)
                    }
                }
            }
        }
        return devices
    }

    private func findService(_ id: String) -> HMService? {
        for home in manager.homes {
            for accessory in home.accessories {
                for service in accessory.services where service.uniqueIdentifier.uuidString == id {
                    return service
                }
            }
        }
        return nil
    }

    // MARK: - Writing

    private func write(_ params: [String: Any], completion: @escaping (String?) -> Void) {
        guard let id = params["id"] as? String,
              let key = params["key"] as? String,
              let service = findService(id) else {
            completion("device not found")
            return
        }
        let type: String
        let value: Any
        switch key {
        case "on":
            type = HMCharacteristicTypePowerState
            guard let flag = params["value"] as? Bool else { completion("bad value"); return }
            value = flag
        case "brightness":
            type = HMCharacteristicTypeBrightness
            guard let number = params["value"] as? NSNumber else { completion("bad value"); return }
            value = min(100, max(0, number.intValue))
        case "targetTemp":
            type = HMCharacteristicTypeTargetTemperature
            guard let number = params["value"] as? NSNumber else { completion("bad value"); return }
            var temperature = number.doubleValue
            if let metadata = findCharacteristic(service, type)?.metadata,
               let low = metadata.minimumValue?.doubleValue,
               let high = metadata.maximumValue?.doubleValue {
                temperature = min(high, max(low, temperature))
            }
            value = temperature
        case "mode":
            type = HMCharacteristicTypeTargetHeatingCooling
            guard let number = params["value"] as? NSNumber else { completion("bad value"); return }
            value = number.intValue
        default:
            completion("unknown key: \(key)")
            return
        }
        guard let characteristic = findCharacteristic(service, type) else {
            completion("characteristic missing")
            return
        }
        characteristic.writeValue(value) { [weak self] error in
            if let error = error {
                completion(error.localizedDescription)
                return
            }
            if let self = self, let accessory = service.accessory {
                self.emitDevice(service, accessory)
            }
            completion(nil)
        }
    }

    // MARK: - Listening

    /// Subscribes to every accessory so changes made elsewhere (Siri, the Home
    /// app, a switch on the wall) reach the page without asking.
    private func observe() {
        for home in manager.homes {
            home.delegate = self
            for accessory in home.accessories {
                accessory.delegate = self
                for service in accessory.services where deviceKind(of: service) != nil {
                    for characteristic in service.characteristics where watched.contains(characteristic.characteristicType) {
                        characteristic.enableNotification(true) { _ in }
                    }
                }
            }
        }
    }

    private func refreshValues() {
        for home in manager.homes {
            for accessory in home.accessories where accessory.isReachable {
                for service in accessory.services where deviceKind(of: service) != nil {
                    for characteristic in service.characteristics
                    where watched.contains(characteristic.characteristicType)
                        && characteristic.properties.contains(HMCharacteristicPropertyReadable) {
                        characteristic.readValue { [weak self] error in
                            if error == nil { self?.emitDevice(service, accessory) }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Sending to the page

    private func reply(_ id: String, result: [String: Any]) {
        send(["replyTo": id, "result": result])
    }

    private func reply(_ id: String, error: String) {
        send(["replyTo": id, "error": error])
    }

    private func emitChanged() {
        send(["event": "changed"])
    }

    private func emitDevice(_ service: HMService, _ accessory: HMAccessory) {
        guard let home = home(of: accessory), let device = describe(service, of: accessory, in: home) else { return }
        send(["event": "device", "device": device])
    }

    private func send(_ payload: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(
                "window.__kinboardNativeReceive && window.__kinboardNativeReceive(\(json));",
                completionHandler: nil
            )
        }
    }
}

// MARK: - HomeKit delegates

extension HomeKitBridge: HMHomeManagerDelegate {
    func homeManagerDidUpdateHomes(_ manager: HMHomeManager) {
        ready = true
        observe()
        emitChanged()
    }

    func homeManager(_ manager: HMHomeManager, didUpdate status: HMHomeManagerAuthorizationStatus) {
        if status.contains(.determined) { ready = true }
        emitChanged()
    }

    func homeManager(_ manager: HMHomeManager, didAdd home: HMHome) {
        observe()
        emitChanged()
    }

    func homeManager(_ manager: HMHomeManager, didRemove home: HMHome) {
        emitChanged()
    }
}

extension HomeKitBridge: HMHomeDelegate {
    func home(_ home: HMHome, didAdd accessory: HMAccessory) {
        observe()
        emitChanged()
    }

    func home(_ home: HMHome, didRemove accessory: HMAccessory) {
        emitChanged()
    }

    func home(_ home: HMHome, didAdd room: HMRoom) {
        emitChanged()
    }

    func home(_ home: HMHome, didRemove room: HMRoom) {
        emitChanged()
    }

    func home(_ home: HMHome, didUpdateNameFor room: HMRoom) {
        emitChanged()
    }

    func home(_ home: HMHome, didUpdateRoom room: HMRoom, for accessory: HMAccessory) {
        emitChanged()
    }
}

extension HomeKitBridge: HMAccessoryDelegate {
    func accessory(_ accessory: HMAccessory, service: HMService, didUpdateValueFor characteristic: HMCharacteristic) {
        emitDevice(service, accessory)
    }

    func accessoryDidUpdateReachability(_ accessory: HMAccessory) {
        emitChanged()
    }

    func accessoryDidUpdateName(_ accessory: HMAccessory) {
        emitChanged()
    }
}
