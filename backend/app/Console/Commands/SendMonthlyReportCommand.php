<?php

namespace App\Console\Commands;

use App\Mail\MonthlyReportMail;
use App\Models\User;
use App\Services\ReportService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;

class SendMonthlyReportCommand extends Command
{
    protected $signature = 'reports:send-monthly {--dry-run}';

    protected $description = 'Generate and email monthly P&L report to all active admins';

    public function __construct(private ReportService $reports)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $from = now()->startOfMonth()->toDateString();
        $to = now()->endOfMonth()->toDateString();

        if ($this->option('dry-run')) {
            $this->info("[dry-run] Would send monthly report ({$from}–{$to}) to active admins.");

            return Command::SUCCESS;
        }

        $data = $this->reports->gatherData($from, $to, 'monthly');
        $pdf = Pdf::loadView('reports.monthly', $data)->setPaper('a4', 'portrait');
        $content = $pdf->output();
        $filename = "monthly-report-{$from}-{$to}.pdf";

        $admins = User::where('role', 'admin')->where('is_active', true)->get();

        foreach ($admins as $admin) {
            Mail::to($admin->email)->send(new MonthlyReportMail(
                adminName: $admin->name,
                dateFrom: $from,
                dateTo: $to,
                pdfContent: $content,
                filename: $filename,
            ));
        }

        $this->info("Monthly report sent to {$admins->count()} admin(s).");

        return Command::SUCCESS;
    }
}
