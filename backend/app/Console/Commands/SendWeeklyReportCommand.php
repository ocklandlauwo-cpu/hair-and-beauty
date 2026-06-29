<?php

namespace App\Console\Commands;

use App\Mail\WeeklyReportMail;
use App\Models\User;
use App\Services\ReportService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;

class SendWeeklyReportCommand extends Command
{
    protected $signature = 'reports:send-weekly {--dry-run}';

    protected $description = 'Generate and email weekly sales report to all active admins';

    public function __construct(private ReportService $reports)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $from = now()->startOfWeek()->toDateString();
        $to = now()->endOfWeek()->toDateString();

        if ($this->option('dry-run')) {
            $this->info("[dry-run] Would send weekly report ({$from}–{$to}) to active admins.");

            return Command::SUCCESS;
        }

        $data = $this->reports->gatherData($from, $to, 'weekly');
        $pdf = Pdf::loadView('reports.weekly', $data)->setPaper('a4', 'portrait');
        $content = $pdf->output();
        $filename = "weekly-report-{$from}-{$to}.pdf";

        $admins = User::where('role', 'admin')->where('is_active', true)->get();

        foreach ($admins as $admin) {
            Mail::to($admin->email)->send(new WeeklyReportMail(
                adminName: $admin->name,
                dateFrom: $from,
                dateTo: $to,
                pdfContent: $content,
                filename: $filename,
            ));
        }

        $this->info("Weekly report sent to {$admins->count()} admin(s).");

        return Command::SUCCESS;
    }
}
