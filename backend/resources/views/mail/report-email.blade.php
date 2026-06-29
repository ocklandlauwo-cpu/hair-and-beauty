<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; color: #333; font-size: 14px; max-width: 600px; margin: auto;">
    <h2 style="color: #1F3A5F;">{{ $subject }}</h2>
    <p>Dear {{ $adminName }},</p>
    <p>Please find attached the <strong>{{ $reportType }}</strong> for the period <strong>{{ $from }}</strong> to <strong>{{ $to }}</strong>.</p>
    <p>This report includes sales performance, expenses, and net profit across all locations.</p>
    <hr style="border: 1px solid #e0e0e0; margin: 20px 0;">
    <p style="color: #999; font-size: 12px;">Hair & Beauty Intelligence Platform — Automated Report</p>
</body>
</html>
