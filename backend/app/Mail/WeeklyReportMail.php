<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class WeeklyReportMail extends Mailable
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
        return new Envelope(subject: "Weekly Sales Report ({$this->dateFrom} – {$this->dateTo})");
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.report-email',
            with: [
                'subject' => 'Weekly Sales Report',
                'adminName' => $this->adminName,
                'reportType' => 'Weekly Sales Report',
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
