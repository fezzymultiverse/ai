package com.festers.horizon.edge

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.BaseDataSource
import androidx.media3.datasource.DataSpec
import java.io.IOException
import java.io.InterruptedIOException
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/** In-memory byte hand-off from the WebSocket thread to ExoPlayer. No files, no sockets, no loopback server. */
class EdgeAudioPipe {
    private val q = LinkedBlockingQueue<ByteArray>()
    private val queued = AtomicLong(0L)
    @Volatile private var drained = false
    @Volatile var closed = false
        private set

    fun put(b: ByteArray) {
        if (closed || b.isEmpty()) return
        queued.addAndGet(b.size.toLong())
        q.offer(b)
    }

    /** No more audio is coming; the reader finishes what is queued, then sees end-of-input. */
    fun finish() {
        q.offer(END)
    }

    /** Drop everything and wake the reader. */
    fun close() {
        closed = true
        q.clear()
        queued.set(0L)
        q.offer(END)
    }

    fun pending(): Long = queued.get()

    fun isEnd(b: ByteArray): Boolean = b === END

    /** Next chunk, END at end of stream, or null after timeoutMs with nothing new. */
    fun take(timeoutMs: Long): ByteArray? {
        if (drained) return END
        val b = q.poll(timeoutMs, TimeUnit.MILLISECONDS) ?: return null
        if (b === END) {
            drained = true
            return END
        }
        queued.addAndGet(-b.size.toLong())
        return b
    }

    private companion object {
        val END = ByteArray(0)
    }
}

@androidx.annotation.OptIn(UnstableApi::class)
class EdgePipeDataSource(private val pipe: EdgeAudioPipe) : BaseDataSource(false) {
    private var cur: ByteArray? = null
    private var off = 0
    private var uri: Uri? = null
    private var opened = false

    @Throws(IOException::class)
    override fun open(dataSpec: DataSpec): Long {
        uri = dataSpec.uri
        transferInitializing(dataSpec)
        opened = true
        transferStarted(dataSpec)
        return C.LENGTH_UNSET.toLong()
    }

    @Throws(IOException::class)
    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        if (length == 0) return 0
        while (true) {
            val c = cur
            if (c != null && off < c.size) {
                val n = minOf(length, c.size - off)
                System.arraycopy(c, off, buffer, offset, n)
                off += n
                bytesTransferred(n)
                return n
            }
            if (pipe.closed) return C.RESULT_END_OF_INPUT
            var next: ByteArray? = null
            try {
                next = pipe.take(250L)
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                throw InterruptedIOException()
            }
            if (next == null) continue
            if (pipe.isEnd(next)) return C.RESULT_END_OF_INPUT
            cur = next
            off = 0
        }
    }

    override fun getUri(): Uri? = uri

    override fun close() {
        cur = null
        if (opened) {
            opened = false
            transferEnded()
        }
    }
}
