import 'package:flutter/material.dart';

import '../debug_log.dart';
import '../services/settings_store.dart';
import '../theme/manzoni_theme.dart';

/// Screen for entering and persisting Colombo connection settings.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, required this.store, this.embedded = false, this.closeAllOnSave = false});

  final SettingsStore store;
  final bool embedded;
  final bool closeAllOnSave;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _formKey = GlobalKey<FormState>();
  final _baseUrlCtrl = TextEditingController();
  final _usernameCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();

  bool _loadingSavedValues = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    logDebug('SettingsScreen: initState');
    final settings = widget.store.snapshot();
    if (settings != null) {
      _populateSettings(settings);
      _loadingSavedValues = false;
      logDebug('SettingsScreen: initialized from store snapshot');
    } else {
      _loadSettings();
    }
  }

  Future<void> _loadSettings() async {
    logDebug('SettingsScreen.loadSettings: start');
    try {
      final settings = await traceDebug(
        'SettingsScreen.store.load',
        widget.store.load,
      );

      if (!mounted) return;
      setState(() {
        _populateSettings(settings);
      });
      logDebug('SettingsScreen.loadSettings: populated controllers');
    } catch (_) {
      if (!mounted) return;
      logDebug('SettingsScreen.loadSettings: showing load failure');
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Saved settings could not be loaded. You can still type manually.',
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _loadingSavedValues = false);
        logDebug('SettingsScreen.loadSettings: loading flag cleared');
      }
    }
  }

  void _populateSettings(Map<String, String?> settings) {
    _baseUrlCtrl.text = settings['baseUrl'] ?? '';
    _usernameCtrl.text = settings['username'] ?? '';
    _passwordCtrl.text = settings['password'] ?? '';
  }

  Future<void> _save() async {
    logDebug('SettingsScreen.save: pressed');
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    setState(() => _saving = true);
    try {
      await traceDebug(
        'SettingsScreen.store.save',
        () => widget.store.save(
          baseUrl: _baseUrlCtrl.text.trim(),
          username: _usernameCtrl.text.trim(),
          password: _passwordCtrl.text,
        ),
      );
      if (!mounted) return;
      logDebug('SettingsScreen.save: showing success');
      if (widget.closeAllOnSave) {
        Navigator.pop(context, true);
      } else {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Settings saved.')));
      }
    } catch (e) {
      if (!mounted) return;
      logDebug('SettingsScreen.save: showing failure: $e');
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Failed to save: $e')));
    } finally {
      if (mounted) {
        setState(() => _saving = false);
        logDebug('SettingsScreen.save: saving flag cleared');
      }
    }
  }

  @override
  void dispose() {
    logDebug('SettingsScreen: dispose');
    _baseUrlCtrl.dispose();
    _usernameCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    logDebug('SettingsScreen.build');
    final content = _SettingsContent(
      formKey: _formKey,
      baseUrlCtrl: _baseUrlCtrl,
      usernameCtrl: _usernameCtrl,
      passwordCtrl: _passwordCtrl,
      loadingSavedValues: _loadingSavedValues,
      saving: _saving,
      onSave: _save,
    );

    if (widget.embedded) {
      return content;
    }

    return Scaffold(
      body: AppSurface(
        child: SafeArea(
          child: Column(
            children: [
              ShellHeader(
                status: 'profile',
                leading: IconButton(
                  icon: const Icon(Icons.chevron_left),
                  tooltip: 'Back',
                  onPressed: () => Navigator.pop(context),
                ),
              ),
              Expanded(child: content),
            ],
          ),
        ),
      ),
    );
  }
}

class _SettingsContent extends StatelessWidget {
  const _SettingsContent({
    required this.formKey,
    required this.baseUrlCtrl,
    required this.usernameCtrl,
    required this.passwordCtrl,
    required this.loadingSavedValues,
    required this.saving,
    required this.onSave,
  });

  final GlobalKey<FormState> formKey;
  final TextEditingController baseUrlCtrl;
  final TextEditingController usernameCtrl;
  final TextEditingController passwordCtrl;
  final bool loadingSavedValues;
  final bool saving;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: Form(
            key: formKey,
            child: Column(
              children: [
                const Panel(
                  padding: EdgeInsets.all(18),
                  child: SectionLabel(
                    icon: Icons.manage_accounts_outlined,
                    title: 'Colombo connection',
                    subtitle: 'Credentials are cached before route entry.',
                    color: ManzoniColors.coral,
                  ),
                ),
                const SizedBox(height: 12),
                Panel(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      if (loadingSavedValues) ...[
                        const LinearProgressIndicator(),
                        const SizedBox(height: 14),
                      ],
                      _SettingsField(
                        controller: baseUrlCtrl,
                        label: 'Base URL',
                        hint: 'https://colombo.example.com',
                        icon: Icons.link,
                        keyboardType: TextInputType.url,
                        textInputAction: TextInputAction.next,
                        validator: (v) =>
                            (v == null || v.trim().isEmpty) ? 'Required' : null,
                      ),
                      const SizedBox(height: 12),
                      _SettingsField(
                        controller: usernameCtrl,
                        label: 'Username',
                        icon: Icons.person_outline,
                        textInputAction: TextInputAction.next,
                        validator: (v) =>
                            (v == null || v.trim().isEmpty) ? 'Required' : null,
                      ),
                      const SizedBox(height: 12),
                      _SettingsField(
                        controller: passwordCtrl,
                        label: 'Password / Key',
                        icon: Icons.key_outlined,
                        obscureText: true,
                        textInputAction: TextInputAction.done,
                        validator: (v) =>
                            (v == null || v.isEmpty) ? 'Required' : null,
                      ),
                      const SizedBox(height: 18),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          onPressed: saving ? null : onSave,
                          icon: saving
                              ? const SizedBox(
                                  height: 18,
                                  width: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Icon(Icons.save_outlined),
                          label: const Text('Save'),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SettingsField extends StatelessWidget {
  const _SettingsField({
    required this.controller,
    required this.label,
    required this.icon,
    this.hint,
    this.obscureText = false,
    this.keyboardType,
    this.textInputAction,
    this.validator,
  });

  final TextEditingController controller;
  final String label;
  final IconData icon;
  final String? hint;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final String? Function(String?)? validator;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: Icon(icon, size: 20),
      ),
      obscureText: obscureText,
      keyboardType: keyboardType,
      textInputAction: textInputAction,
      autocorrect: false,
      enableSuggestions: false,
      enableIMEPersonalizedLearning: false,
      smartDashesType: SmartDashesType.disabled,
      smartQuotesType: SmartQuotesType.disabled,
      autofillHints: const <String>[],
      validator: validator,
    );
  }
}
