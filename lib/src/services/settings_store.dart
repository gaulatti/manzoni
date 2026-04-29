import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../debug_log.dart';

/// Keys used in secure storage.
class _Keys {
  static const baseUrl = 'colombo_base_url';
  static const username = 'colombo_username';
  static const password = 'colombo_password';
}

/// Wraps [FlutterSecureStorage] to persist Colombo connection settings.
class SettingsStore {
  SettingsStore({
    FlutterSecureStorage? storage,
    SharedPreferences? debugPrefs,
    bool? useDebugPrefs,
  }) : _storage = storage ?? const FlutterSecureStorage(),
       _debugPrefs = debugPrefs,
       _useDebugPrefs = useDebugPrefs ?? (kDebugMode && storage == null);

  static Future<SettingsStore> create() async {
    if (!kDebugMode) return SettingsStore();

    final prefs = await traceDebug(
      'SettingsStore.create.SharedPreferences.getInstance',
      SharedPreferences.getInstance,
    );
    return SettingsStore(debugPrefs: prefs);
  }

  final FlutterSecureStorage _storage;
  SharedPreferences? _debugPrefs;
  Future<SharedPreferences>? _debugPrefsInit;
  final bool _useDebugPrefs;
  Map<String, String?>? _cache;

  Future<SharedPreferences> _getDebugPrefs() async {
    final existing = _debugPrefs;
    if (existing != null) {
      logDebug('SettingsStore.debugPrefs: using cached instance');
      return existing;
    }

    final pending = _debugPrefsInit;
    if (pending != null) {
      logDebug('SettingsStore.debugPrefs: awaiting pending init');
      final prefs = await pending;
      _debugPrefs = prefs;
      return prefs;
    }

    logDebug('SettingsStore.debugPrefs: initializing SharedPreferences');
    final createdFuture = SharedPreferences.getInstance();
    _debugPrefsInit = createdFuture;
    final prefs = await traceDebug(
      'SettingsStore.debugPrefs.getInstance',
      () => createdFuture,
    );
    _debugPrefs = prefs;
    return prefs;
  }

  Future<void> _write(String key, String value) async {
    logDebug(
      'SettingsStore.write($key): using ${_useDebugPrefs ? 'debug prefs' : 'secure storage'}',
    );
    if (_useDebugPrefs) {
      final prefs = await _getDebugPrefs();
      await traceDebug(
        'SettingsStore.debugPrefs.setString($key)',
        () => prefs.setString(key, value),
      );
      return;
    }
    await traceDebug(
      'SettingsStore.secureStorage.write($key)',
      () => _storage.write(key: key, value: value),
    );
  }

  Future<String?> _read(String key) async {
    logDebug(
      'SettingsStore.read($key): using ${_useDebugPrefs ? 'debug prefs' : 'secure storage'}',
    );
    if (_useDebugPrefs) {
      final prefs = await _getDebugPrefs();
      return prefs.getString(key);
    }
    return traceDebug(
      'SettingsStore.secureStorage.read($key)',
      () => _storage.read(key: key),
    );
  }

  Future<void> saveBaseUrl(String value) => _write(_Keys.baseUrl, value);

  Future<void> saveUsername(String value) => _write(_Keys.username, value);

  Future<void> savePassword(String value) => _write(_Keys.password, value);

  Future<String?> loadBaseUrl() => _read(_Keys.baseUrl);
  Future<String?> loadUsername() => _read(_Keys.username);
  Future<String?> loadPassword() => _read(_Keys.password);

  /// Returns the already-loaded settings without touching platform storage.
  Map<String, String?>? snapshot() {
    final cache = _cache;
    if (cache == null) return null;
    return Map<String, String?>.from(cache);
  }

  /// Saves all settings at once.
  Future<void> save({
    required String baseUrl,
    required String username,
    required String password,
  }) async {
    logDebug('SettingsStore.save: start');
    // Do these sequentially; some secure-storage backends can deadlock or
    // become unresponsive when multiple channel requests are fired at once.
    await saveBaseUrl(baseUrl);
    await saveUsername(username);
    await savePassword(password);

    _cache = {'baseUrl': baseUrl, 'username': username, 'password': password};
    logDebug('SettingsStore.save: cache updated');
  }

  /// Loads all settings at once. Returns a map with nullable values.
  Future<Map<String, String?>> load({bool forceRefresh = false}) async {
    if (!forceRefresh && _cache != null) {
      logDebug('SettingsStore.load: cache hit');
      return Map<String, String?>.from(_cache!);
    }

    logDebug('SettingsStore.load: cache miss');
    if (_useDebugPrefs && _debugPrefs != null) {
      final prefs = _debugPrefs!;
      final loaded = {
        'baseUrl': prefs.getString(_Keys.baseUrl),
        'username': prefs.getString(_Keys.username),
        'password': prefs.getString(_Keys.password),
      };
      _cache = loaded;
      logDebug('SettingsStore.load: debug prefs sync cache updated');
      return Map<String, String?>.from(loaded);
    }

    // Same rationale as save(): serialize reads to avoid plugin/channel stalls.
    final baseUrl = await loadBaseUrl();
    final username = await loadUsername();
    final password = await loadPassword();
    final loaded = {
      'baseUrl': baseUrl,
      'username': username,
      'password': password,
    };

    _cache = loaded;
    logDebug('SettingsStore.load: cache updated');
    return Map<String, String?>.from(loaded);
  }
}
