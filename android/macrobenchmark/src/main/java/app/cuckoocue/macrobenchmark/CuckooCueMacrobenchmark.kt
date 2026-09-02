package app.cuckoocue.macrobenchmark

import androidx.benchmark.macro.CompilationMode
import androidx.benchmark.macro.FrameTimingMetric
import androidx.benchmark.macro.StartupMode
import androidx.benchmark.macro.StartupTimingMetric
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Until
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CuckooCueMacrobenchmark {
    @get:Rule
    val benchmarkRule = MacrobenchmarkRule()

    @Test
    fun warmStartup() = benchmarkRule.measureRepeated(
        packageName = PACKAGE_NAME,
        metrics = listOf(StartupTimingMetric(), FrameTimingMetric()),
        compilationMode = CompilationMode.Partial(),
        startupMode = StartupMode.WARM,
        iterations = Iterations,
        setupBlock = {
            seedBenchmarkData(runCount = 10, tasksPerRun = 5)
            pressHome()
        },
    ) {
        startActivityAndWait()
        device.wait(Until.hasObject(By.text("手元に置くこと")), WAIT_TIMEOUT_MS)
    }

    @Test
    fun openRunAndEditControls() = benchmarkRule.measureRepeated(
        packageName = PACKAGE_NAME,
        metrics = listOf(FrameTimingMetric()),
        compilationMode = CompilationMode.Partial(),
        startupMode = StartupMode.WARM,
        iterations = Iterations,
        setupBlock = {
            seedBenchmarkData(runCount = 10, tasksPerRun = 5)
            pressHome()
            startActivityAndWait()
            device.wait(Until.hasObject(By.text("手元に置くこと")), WAIT_TIMEOUT_MS)
        },
    ) {
        device.findObject(By.text("手元に置くこと"))?.click()
        device.wait(Until.hasObject(By.text("新しい項目")), WAIT_TIMEOUT_MS)
        device.findObject(By.text("⋯"))?.click()
        device.wait(Until.hasObject(By.text("日付")), WAIT_TIMEOUT_MS)
        device.findObject(By.text("強"))?.click()
        device.findObject(By.text("保存"))?.click()
    }

    @Test
    fun runListScroll_10Runs_5Tasks() = runListScrollBenchmark(runCount = 10)

    @Test
    fun runListScroll_100Runs_5Tasks() = runListScrollBenchmark(runCount = 100)

    @Test
    fun runListScroll_500Runs_5Tasks() = runListScrollBenchmark(runCount = 500)

    @Test
    fun runListScroll_preseeded() = benchmarkRule.measureRepeated(
        packageName = PACKAGE_NAME,
        metrics = listOf(FrameTimingMetric()),
        compilationMode = CompilationMode.Partial(),
        startupMode = StartupMode.WARM,
        iterations = ScrollIterations,
        setupBlock = {
            pressHome()
            startActivityAndWait()
            device.wait(Until.hasObject(By.text("手元に置くこと")), WAIT_TIMEOUT_MS)
        },
    ) {
        scrollRunList()
    }

    private fun runListScrollBenchmark(runCount: Int) = benchmarkRule.measureRepeated(
        packageName = PACKAGE_NAME,
        metrics = listOf(FrameTimingMetric()),
        compilationMode = CompilationMode.Partial(),
        startupMode = StartupMode.WARM,
        iterations = ScrollIterations,
        setupBlock = {
            seedBenchmarkData(runCount = runCount, tasksPerRun = 5)
            pressHome()
            startActivityAndWait()
            device.wait(Until.hasObject(By.text("手元に置くこと")), WAIT_TIMEOUT_MS)
        },
    ) {
        scrollRunList()
    }

    private fun androidx.benchmark.macro.MacrobenchmarkScope.scrollRunList() {
        val width = device.displayWidth
        val height = device.displayHeight
        repeat(3) {
            shellSwipe(width / 2, height * 3 / 4, width / 2, height / 4)
        }
        repeat(1) {
            shellSwipe(width / 2, height / 4, width / 2, height * 3 / 4)
        }
    }

    private fun androidx.benchmark.macro.MacrobenchmarkScope.shellSwipe(
        startX: Int,
        startY: Int,
        endX: Int,
        endY: Int,
    ) {
        device.executeShellCommand("input swipe $startX $startY $endX $endY 250")
    }

    private fun androidx.benchmark.macro.MacrobenchmarkScope.seedBenchmarkData(
        runCount: Int,
        tasksPerRun: Int,
    ) {
        device.executeShellCommand(
            "am broadcast -a app.cuckoocue.benchmark.RESET_SEED " +
                "-n $PACKAGE_NAME/.benchmark.BenchmarkSeedReceiver " +
                "--ei run_count $runCount --ei tasks_per_run $tasksPerRun",
        )
    }

    companion object {
        private const val PACKAGE_NAME = "app.cuckoocue"
        private const val WAIT_TIMEOUT_MS = 5_000L
        private const val Iterations = 3
        private const val ScrollIterations = 1
    }
}
