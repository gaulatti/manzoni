import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

class ManzoniColors {
  static const sea = Color(0xFF4A90E2);
  static const indigo = Color(0xFF6B73FF);
  static const amber = Color(0xFFFFA726);
  static const coral = Color(0xFFFF8A65);
  static const lightSand = Color(0xFF0D1421);
  static const deepSea = Color(0xFF1A2332);
  static const darkSand = Color(0xFF243447);
  static const sand = Color(0xFF2D4159);
  static const sunset = coral;
  static const desert = amber;
  static const terracotta = Color(0xFFEF5350);
  static const textPrimary = Color(0xFFF8F9FA);
  static const textSecondary = Color(0xFFD1D9E6);
  static const textTertiary = Color(0xFFAAB4C8);
}

class ManzoniTheme {
  static const _fontFamily = 'LibreFranklin';

  static TextStyle _textStyle({
    required double fontSize,
    required FontWeight fontWeight,
    required Color color,
  }) {
    return TextStyle(
      fontFamily: _fontFamily,
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
    );
  }

  static ThemeData get dark {
    final base = ThemeData.dark(useMaterial3: true);
    return base.copyWith(
      scaffoldBackgroundColor: ManzoniColors.lightSand,
      colorScheme: const ColorScheme.dark(
        primary: ManzoniColors.sea,
        secondary: ManzoniColors.amber,
        tertiary: ManzoniColors.coral,
        error: ManzoniColors.terracotta,
        surface: ManzoniColors.deepSea,
        onPrimary: Colors.white,
        onSecondary: ManzoniColors.lightSand,
        onSurface: ManzoniColors.textPrimary,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        foregroundColor: ManzoniColors.textPrimary,
        titleTextStyle: _textStyle(
          fontSize: 17,
          fontWeight: FontWeight.w600,
          color: ManzoniColors.textPrimary,
        ),
      ),
      textTheme: TextTheme(
        displaySmall: _textStyle(
          fontSize: 28,
          fontWeight: FontWeight.w700,
          color: ManzoniColors.textPrimary,
        ),
        headlineSmall: _textStyle(
          fontSize: 22,
          fontWeight: FontWeight.w700,
          color: ManzoniColors.textPrimary,
        ),
        titleLarge: _textStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: ManzoniColors.textPrimary,
        ),
        titleMedium: _textStyle(
          fontSize: 16,
          fontWeight: FontWeight.w600,
          color: ManzoniColors.textPrimary,
        ),
        bodyLarge: _textStyle(
          fontSize: 17,
          fontWeight: FontWeight.w400,
          color: ManzoniColors.textPrimary,
        ),
        bodyMedium: _textStyle(
          fontSize: 15,
          fontWeight: FontWeight.w400,
          color: ManzoniColors.textPrimary,
        ),
        bodySmall: _textStyle(
          fontSize: 13,
          fontWeight: FontWeight.w400,
          color: ManzoniColors.textSecondary,
        ),
        labelLarge: _textStyle(
          fontSize: 15,
          fontWeight: FontWeight.w600,
          color: ManzoniColors.textPrimary,
        ),
        labelMedium: _textStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: ManzoniColors.textPrimary,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: ManzoniColors.deepSea.withValues(alpha: 0.65),
        labelStyle: const TextStyle(
          fontFamily: _fontFamily,
          color: ManzoniColors.textSecondary,
        ),
        hintStyle: TextStyle(
          fontFamily: _fontFamily,
          color: ManzoniColors.textSecondary.withValues(alpha: 0.7),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.1)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.1)),
        ),
        focusedBorder: const OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(8)),
          borderSide: BorderSide(color: ManzoniColors.sea, width: 2),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: ManzoniColors.sea,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
          textStyle: _textStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          foregroundColor: ManzoniColors.textPrimary,
          backgroundColor: Colors.white.withValues(alpha: 0.05),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: ManzoniColors.sea,
        linearTrackColor: ManzoniColors.darkSand,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: ManzoniColors.deepSea.withValues(alpha: 0.96),
        contentTextStyle: _textStyle(
          color: ManzoniColors.textPrimary,
          fontSize: 14,
          fontWeight: FontWeight.w400,
        ),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }
}

class AppSurface extends StatelessWidget {
  const AppSurface({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [ManzoniColors.lightSand, ManzoniColors.deepSea],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: child,
    );
  }
}

class Panel extends StatelessWidget {
  const Panel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
  });

  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
      ),
      child: child,
    );
  }
}

class BrandTitle extends StatelessWidget {
  const BrandTitle({super.key, this.name = 'manzoni'});

  final String name;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SvgPicture.asset(
          'assets/images/logo.svg',
          height: 30,
          colorFilter: const ColorFilter.mode(
            ManzoniColors.textPrimary,
            BlendMode.srcIn,
          ),
        ),
        const SizedBox(width: 14),
        Container(
          width: 1,
          height: 30,
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.transparent,
                ManzoniColors.sunset,
                Colors.transparent,
              ],
            ),
          ),
        ),
        const SizedBox(width: 14),
        Text(
          name,
          style: const TextStyle(
            fontFamily: ManzoniTheme._fontFamily,
            fontSize: 26,
            fontWeight: FontWeight.w700,
            color: ManzoniColors.textPrimary,
          ),
        ),
      ],
    );
  }
}

class ShellHeader extends StatelessWidget {
  const ShellHeader({super.key, this.leading, this.trailing, this.status});

  final Widget? leading;
  final Widget? trailing;
  final String? status;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
      child: Row(
        children: [
          if (leading != null) ...[leading!, const SizedBox(width: 12)],
          const BrandTitle(),
          const Spacer(),
          if (status != null) ...[
            StatusPill(label: status!),
            const SizedBox(width: 10),
          ],
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: ManzoniColors.sea.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: ManzoniColors.sea.withValues(alpha: 0.24)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: const BoxDecoration(
              color: ManzoniColors.sunset,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            label.toUpperCase(),
            style: const TextStyle(
              fontFamily: ManzoniTheme._fontFamily,
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: ManzoniColors.sunset,
            ),
          ),
        ],
      ),
    );
  }
}

class SectionLabel extends StatelessWidget {
  const SectionLabel({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    this.color = ManzoniColors.sea,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.18),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, size: 18, color: color),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 2),
              Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ],
    );
  }
}
