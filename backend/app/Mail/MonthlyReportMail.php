<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class MonthlyReportMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $adminName,
        public string $dateFrom,
        public string $dateTo,
        public string $pdfContent,
        public string $filename,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "Monthly P&L Report ({$this->dateFrom} – {$this->dateTo})");
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.report-email',
            with: [
                'subject' => 'Monthly P&L Report',
                'adminName' => $this->adminName,
                'reportType' => 'Monthly P&L Report',
                'from' => $this->dateFrom,
                'to' => $this->dateTo,
            ],
        );
    }

    public function attachments(): array
    {
        return [
            Attachment::fromData(fn () => $this->pdfContent, $this->filename)
                ->withMime('application/pdf'),
        ];
    }
}
