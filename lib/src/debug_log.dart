import 'package:flutter/foundation.dart';

String _stamp() => DateTime.now().toIso8601String();

void logDebug(String message) {
  if (!kDebugMode) return;
  debugPrint('[manzoni ${_stamp()}] $message');
}

Future<T> traceDebug<T>(String label, Future<T> Function() action) async {
  if (!kDebugMode) return action();

  final stopwatch = Stopwatch()..start();
  logDebug('$label: start');
  try {
    final result = await action();
    logDebug('$label: done in ${stopwatch.elapsedMilliseconds}ms');
    return result;
  } catch (error, stackTrace) {
    logDebug('$label: failed after ${stopwatch.elapsedMilliseconds}ms: $error');
    debugPrintStack(stackTrace: stackTrace);
    rethrow;
  }
}
