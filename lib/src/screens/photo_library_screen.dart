import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'settings_screen.dart';
import '../services/settings_store.dart';
import '../services/upload_queue.dart';
import '../debug_log.dart';
import '../theme/manzoni_theme.dart';

class PhotoLibraryPicker extends StatefulWidget {
  const PhotoLibraryPicker({super.key, required this.store, required this.queue});
  final SettingsStore store;
  final UploadQueue queue;

  @override
  State<PhotoLibraryPicker> createState() => _PhotoLibraryPickerState();
}

class _PhotoLibraryPickerState extends State<PhotoLibraryPicker> {
  final ImagePicker _picker = ImagePicker();
  final List<String> _paths = [];
  final List<String> _thumbnails = [];
  bool _settingsConfigured = false;
  bool _loadingSettings = true;

  @override
  void initState() {
    super.initState();
    _checkSettings();
  }

  Future<void> _checkSettings() async {
    final settings = await widget.store.load(forceRefresh: true);
    if (!mounted) return;
    setState(() {
      _settingsConfigured =
          settings['baseUrl'] != null &&
          settings['baseUrl']!.isNotEmpty &&
          settings['username'] != null &&
          settings['username']!.isNotEmpty &&
          settings['password'] != null &&
          settings['password']!.isNotEmpty;
      _loadingSettings = false;
    });
  }

  void _openSettings() async {
    final saved = await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => SettingsScreen(store: widget.store, closeAllOnSave: true)),
    );
    if (saved == true && mounted) {
      Navigator.pop(context);
    }
  }

  Future<void> _pickPhotos() async {
    logDebug('PhotoLibraryPicker.pickPhotos: opening picker');
    try {
      final result = await _picker.pickMultipleMedia(imageQuality: 100);
      if (result.isEmpty) return;
      logDebug('PhotoLibraryPicker.pickPhotos: ${result.length} selected');
      if (!mounted) return;
      setState(() {
        for (final xFile in result) {
          _paths.add(xFile.path);
          _thumbnails.add(xFile.path);
        }
      });
    } catch (e) {
      if (!mounted) return;
      logDebug('PhotoLibraryPicker.pickPhotos: error $e');
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to pick photos: $e')));
    }
  }

  void _removePhoto(int index) {
    setState(() {
      _paths.removeAt(index);
      _thumbnails.removeAt(index);
    });
  }

  Future<void> _enqueue() async {
    if (_paths.isEmpty) return;
    logDebug('PhotoLibraryPicker.enqueue: ${_paths.length} photos');
    await widget.queue.addFiles(List.from(_paths), List.from(_thumbnails));
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
      decoration: const BoxDecoration(
        color: ManzoniColors.deepSea,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 12),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(color: Colors.grey[400], borderRadius: BorderRadius.circular(2)),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
            child: Row(
              children: [
                Expanded(child: Text('Upload from Library', style: Theme.of(context).textTheme.titleLarge)),
                if (_paths.isNotEmpty)
                  TextButton.icon(
                    onPressed: () => setState(() {
                      _paths.clear();
                      _thumbnails.clear();
                    }),
                    icon: const Icon(Icons.delete_outline, size: 18),
                    label: const Text('Clear'),
                  ),
                IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context), tooltip: 'Close'),
              ],
            ),
          ),
          const Divider(height: 1),
          if (!_settingsConfigured && !_loadingSettings) _buildSettingsPrompt(),
          Flexible(child: _paths.isEmpty ? _buildEmptyState() : _buildPhotoGrid()),
          _buildBottomBar(),
        ],
      ),
    );
  }

  Widget _buildSettingsPrompt() {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ManzoniColors.coral.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ManzoniColors.coral.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Icon(Icons.settings_outlined, color: ManzoniColors.coral),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Settings required', style: Theme.of(context).textTheme.titleSmall?.copyWith(color: ManzoniColors.coral)),
                const SizedBox(height: 2),
                Text('Configure Base URL, Username and Password before uploading.', style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
          const SizedBox(width: 12),
          FilledButton(onPressed: _openSettings, child: const Text('Configure')),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.photo_library_outlined, size: 64, color: ManzoniColors.textSecondary.withValues(alpha: 0.5)),
            const SizedBox(height: 16),
            Text('No photos selected', style: Theme.of(context).textTheme.titleMedium?.copyWith(color: ManzoniColors.textSecondary)),
            const SizedBox(height: 8),
            Text(
              'Tap the button below to pick photos from your library.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: ManzoniColors.textSecondary.withValues(alpha: 0.7)),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPhotoGrid() {
    return GridView.builder(
      padding: const EdgeInsets.all(12),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, crossAxisSpacing: 8, mainAxisSpacing: 8, childAspectRatio: 1),
      itemCount: _paths.length,
      itemBuilder: (context, index) {
        return Stack(
          fit: StackFit.expand,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.file(File(_thumbnails[index]), fit: BoxFit.cover),
            ),
            Positioned(
              top: 4,
              right: 4,
              child: GestureDetector(
                onTap: () => _removePhoto(index),
                child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
                  child: const Icon(Icons.close, color: Colors.white, size: 16),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildBottomBar() {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
      decoration: BoxDecoration(
        color: ManzoniColors.deepSea,
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 8, offset: const Offset(0, -2))],
      ),
      child: Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: _pickPhotos,
              icon: const Icon(Icons.add_photo_alternate),
              label: Text(_paths.isEmpty ? 'Pick Photos' : 'Add More (${_paths.length})'),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: FilledButton.icon(
              onPressed: _paths.isNotEmpty && _settingsConfigured ? _enqueue : null,
              icon: const Icon(Icons.cloud_upload_outlined),
              label: Text(_paths.isEmpty ? 'Select Photos' : 'Upload ${_paths.length}'),
            ),
          ),
        ],
      ),
    );
  }
}
