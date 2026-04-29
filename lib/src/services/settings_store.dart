import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Keys used in secure storage.
class _Keys {
  static const baseUrl = 'colombo_base_url';
  static const username = 'colombo_username';
  static const password = 'colombo_password';
}

/// Wraps [FlutterSecureStorage] to persist Colombo connection settings.
class SettingsStore {
  SettingsStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  Future<void> saveBaseUrl(String value) =>
      _storage.write(key: _Keys.baseUrl, value: value);

  Future<void> saveUsername(String value) =>
      _storage.write(key: _Keys.username, value: value);

  Future<void> savePassword(String value) =>
      _storage.write(key: _Keys.password, value: value);

  Future<String?> loadBaseUrl() => _storage.read(key: _Keys.baseUrl);
  Future<String?> loadUsername() => _storage.read(key: _Keys.username);
  Future<String?> loadPassword() => _storage.read(key: _Keys.password);

  /// Saves all settings at once.
  Future<void> save({
    required String baseUrl,
    required String username,
    required String password,
  }) async {
    await Future.wait([
      saveBaseUrl(baseUrl),
      saveUsername(username),
      savePassword(password),
    ]);
  }

  /// Loads all settings at once. Returns a map with nullable values.
  Future<Map<String, String?>> load() async {
    final results = await Future.wait([
      loadBaseUrl(),
      loadUsername(),
      loadPassword(),
    ]);
    return {
      'baseUrl': results[0],
      'username': results[1],
      'password': results[2],
    };
  }
}
